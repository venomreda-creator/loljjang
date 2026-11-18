'use client';

import { TARGET_QUEUES } from './meta';
import type { Account, MatchRecord } from './types';

export const DETAIL_BATCH = 5;

export type SyncProgress = {
  phase: 'ids' | 'details';
  accountIndex: number;
  accountTotal: number;
  accountLabel: string;
  matchDone: number;
  matchTotal: number;
  added: number;
};

export type SyncErrorItem = { account: string; message: string; code?: string };

export type SyncResult = {
  added: MatchRecord[];
  errors: SyncErrorItem[];
};

export class SyncError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

type ApiOk<T> = { ok: true } & T;
type ApiFail = { ok: false; code: string; message: string };

async function post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  let data: ApiOk<T> | ApiFail;
  try {
    data = (await res.json()) as ApiOk<T> | ApiFail;
  } catch {
    throw new SyncError('BAD_RESPONSE', `서버 응답을 해석할 수 없습니다 (HTTP ${res.status})`);
  }

  if (!data.ok) throw new SyncError(data.code, data.message);
  return data as ApiOk<T>;
}

const keyOf = (r: { matchId: string; puuid: string }) => `${r.matchId}:${r.puuid}`;

type Options = {
  accounts: Account[];
  existing: MatchRecord[];
  count: number;
  signal: AbortSignal;
  onProgress: (p: SyncProgress) => void;
};

/**
 * 등록된 모든 계정의 새 경기를 증분 수집한다.
 * - 이미 보유한 matchId 는 상세 조회를 생략 (PRD FR-3.2)
 * - 계정 단위 실패는 기록하고 계속 진행 (FR-3.4)
 */
export async function syncAll({
  accounts,
  existing,
  count,
  signal,
  onProgress,
}: Options): Promise<SyncResult> {
  const known = new Set(existing.map(keyOf));
  const added: MatchRecord[] = [];
  const errors: SyncErrorItem[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const label = `${account.gameName}#${account.tagLine}`;

    if (!account.puuid) continue;

    try {
      onProgress({
        phase: 'ids',
        accountIndex: i + 1,
        accountTotal: accounts.length,
        accountLabel: label,
        matchDone: 0,
        matchTotal: 0,
        added: added.length,
      });

      const { ids } = await post<{ ids: Record<string, string[]> }>(
        '/api/matches/ids',
        { puuid: account.puuid, count, queues: [...TARGET_QUEUES] },
        signal,
      );

      const pending: string[] = [];
      for (const list of Object.values(ids)) {
        for (const matchId of list) {
          const key = `${matchId}:${account.puuid}`;
          if (!known.has(key) && !pending.includes(matchId)) pending.push(matchId);
        }
      }

      let done = 0;
      for (let j = 0; j < pending.length; j += DETAIL_BATCH) {
        const batch = pending.slice(j, j + DETAIL_BATCH);
        const { records } = await post<{ records: MatchRecord[] }>(
          '/api/matches/detail',
          { puuid: account.puuid, matchIds: batch },
          signal,
        );

        for (const record of records) {
          const key = keyOf(record);
          if (known.has(key)) continue;
          known.add(key);
          added.push(record);
        }

        done += batch.length;
        onProgress({
          phase: 'details',
          accountIndex: i + 1,
          accountTotal: accounts.length,
          accountLabel: label,
          matchDone: done,
          matchTotal: pending.length,
          added: added.length,
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof SyncError && err.code === 'INVALID_KEY') throw err;

      errors.push({
        account: label,
        message: err instanceof Error ? err.message : '알 수 없는 오류',
        code: err instanceof SyncError ? err.code : undefined,
      });
    }
  }

  return { added, errors };
}
