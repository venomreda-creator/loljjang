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
        const result = await syncAll({
          accounts: targets,
          existing: records,
          count,
          signal: controller.signal,
          onProgress: setProgress,
        });

        if (result.added.length) {
          setRecords((prev) => {
            const seen = new Set(prev.map((r) => `${r.matchId}:${r.puuid}`));
            const fresh = result.added.filter((r) => !seen.has(`${r.matchId}:${r.puuid}`));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }
        setUpdatedAt(Date.now());

        if (result.errors.length) {
          setError({
            code: 'PARTIAL',
            message: result.errors.map((e) => `${e.account}: ${e.message}`).join(' / '),
          });
        }
        return { added: result.added.length };
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
