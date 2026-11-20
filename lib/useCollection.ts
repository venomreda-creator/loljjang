'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { topChampionIds } from './aggregate';
import { loadState, saveState } from './store';
import { SyncError, syncAll, type SyncProgress } from './sync';
import type { Account, MatchRecord } from './types';

export const MAX_ACCOUNTS = 10;
export const MAX_CHAMPIONS = 10;

export type CollectionError = { code: string; message: string };
export type AddResult = { ok: true } | { ok: false; message: string };

type ResolveResponse =
  | { ok: true; account: Omit<Account, 'region' | 'status'> }
  | { ok: false; code: string; message: string };

/** puuid 재발급이 필요할 때 Riot ID 로 계정을 다시 조회한다. 실패는 null 로 흡수. */
async function resolveByRiotId(
  gameName: string,
  tagLine: string,
  signal?: AbortSignal,
): Promise<Omit<Account, 'region' | 'status'> | null> {
  try {
    const res = await fetch('/api/account/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameName, tagLine }),
      signal,
    });
    const data = (await res.json()) as ResolveResponse;
    return data.ok ? data.account : null;
  } catch {
    return null;
  }
}

export function useCollection(seed: { records: MatchRecord[]; accounts: Account[] }) {
  const [accounts, setAccounts] = useState<Account[]>(seed.accounts);
  const [records, setRecords] = useState<MatchRecord[]>(seed.records);
  const [championIds, setChampionIds] = useState<number[]>(() =>
    topChampionIds(seed.records, MAX_CHAMPIONS),
  );
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<CollectionError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  // 1) localStorage 복원 — 저장본이 있으면 시드보다 우선
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setAccounts(saved.accounts);
      setRecords(saved.records);
      if (saved.championIds) setChampionIds(saved.championIds);
      setUpdatedAt(saved.updatedAt);
    }
    setHydrated(true);
  }, []);

  // 2) 변경 시 저장
  useEffect(() => {
    if (!hydrated) return;
    saveState({ accounts, records, championIds, updatedAt });
  }, [hydrated, accounts, records, championIds, updatedAt]);

  const runSync = useCallback(
    async (targets: Account[], count: number) => {
      if (runningRef.current || !targets.length) return { added: 0 };
      runningRef.current = true;
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      setProgress({
        phase: 'ids',
        accountIndex: 1,
        accountTotal: targets.length,
        accountLabel: '',
        matchDone: 0,
        matchTotal: 0,
        added: 0,
      });

      try {
        let result = await syncAll({
          accounts: targets,
          existing: records,
          count,
          signal: controller.signal,
          onProgress: setProgress,
        });

        let fresh = [...result.added];
        let errors = [...result.errors];

        // puuid 가 바뀐 계정(지역 이전 등)은 Riot ID 로 재조회해 기록을 그대로 이어붙인다
        const staleLabels = new Set(
          errors.filter((e) => e.code === 'STALE_PUUID').map((e) => e.account),
        );

        if (staleLabels.size) {
          const migrated = new Map<string, string>();
          const relinked = targets.map((a) => ({ ...a }));

          for (let i = 0; i < relinked.length; i++) {
            const acc = relinked[i];
            if (!staleLabels.has(`${acc.gameName}#${acc.tagLine}`)) continue;

            const next = await resolveByRiotId(acc.gameName, acc.tagLine, controller.signal);
            if (next && next.puuid !== acc.puuid) {
              migrated.set(acc.puuid, next.puuid);
              relinked[i] = {
                ...acc,
                puuid: next.puuid,
                summonerLevel: next.summonerLevel ?? acc.summonerLevel,
              };
            }
          }

          if (migrated.size) {
            const remap = (r: MatchRecord): MatchRecord =>
              migrated.has(r.puuid) ? { ...r, puuid: migrated.get(r.puuid)! } : r;

            setAccounts(relinked);
            setRecords((prev) => prev.map(remap));

            result = await syncAll({
              accounts: relinked,
              existing: records.map(remap),
              count,
              signal: controller.signal,
              onProgress: setProgress,
            });
            fresh = [...fresh, ...result.added];
            errors = [...result.errors];
          }
        }

        if (fresh.length) {
          setRecords((prev) => {
            const seen = new Set(prev.map((r) => `${r.matchId}:${r.puuid}`));
            const unique = fresh.filter((r) => {
              const key = `${r.matchId}:${r.puuid}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return unique.length ? [...prev, ...unique] : prev;
          });
        }
        setUpdatedAt(Date.now());

        if (errors.length) {
          setError({
            code: 'PARTIAL',
            message: errors.map((e) => `${e.account}: ${e.message}`).join(' / '),
          });
        }
        return { added: fresh.length };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // 사용자 취소 — 오류 아님
        } else if (err instanceof SyncError) {
          setError({ code: err.code, message: err.message });
        } else {
          setError({
            code: 'UNKNOWN',
            message: err instanceof Error ? err.message : '알 수 없는 오류',
          });
        }
        return { added: 0 };
      } finally {
        runningRef.current = false;
        setProgress(null);
        abortRef.current = null;
      }
    },
    [records],
  );

  const refresh = useCallback(() => runSync(accounts, 20), [accounts, runSync]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /* ── 계정 관리 ─────────────────────────────────────────── */
  const addAccount = useCallback(
    async (gameName: string, tagLine: string): Promise<AddResult> => {
      if (accounts.length >= MAX_ACCOUNTS) {
        return { ok: false, message: `계정은 최대 ${MAX_ACCOUNTS}개까지 등록할 수 있습니다.` };
      }

      let data: ResolveResponse;
      try {
        const res = await fetch('/api/account/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameName, tagLine }),
        });
        data = (await res.json()) as ResolveResponse;
      } catch {
        return { ok: false, message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' };
      }

      if (!data.ok) return { ok: false, message: data.message };

      if (accounts.some((a) => a.puuid === data.account.puuid)) {
        return { ok: false, message: '이미 등록된 계정입니다.' };
      }

      const account: Account = {
        puuid: data.account.puuid,
        gameName: data.account.gameName,
        tagLine: data.account.tagLine,
        region: 'kr',
        summonerLevel: data.account.summonerLevel,
        status: 'ok',
      };

      setAccounts((prev) => [...prev, account]);
      // 등록 직후 소량 백필 (PRD FR-3.1)
      void runSync([account], 10);
      return { ok: true };
    },
    [accounts, runSync],
  );

  const removeAccount = useCallback((puuid: string) => {
    setAccounts((prev) => prev.filter((a) => a.puuid !== puuid));
    setRecords((prev) => prev.filter((r) => r.puuid !== puuid));
  }, []);

  /* ── 챔피언 선택 ───────────────────────────────────────── */
  const toggleChampion = useCallback((championId: number) => {
    setChampionIds((prev) => {
      if (prev.includes(championId)) return prev.filter((id) => id !== championId);
      if (prev.length >= MAX_CHAMPIONS) return prev;
      return [...prev, championId];
    });
  }, []);

  const removeChampion = useCallback((championId: number) => {
    setChampionIds((prev) => prev.filter((id) => id !== championId));
  }, []);

  return {
    accounts,
    records,
    championIds,
    updatedAt,
    hydrated,
    progress,
    error,
    refresh,
    cancel,
    addAccount,
    removeAccount,
    toggleChampion,
    removeChampion,
    clearError: () => setError(null),
  };
}
