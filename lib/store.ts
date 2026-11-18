'use client';

import type { Account, MatchRecord } from './types';

const KEY = 'loljjang:v2';

export type PersistedState = {
  accounts: Account[];
  records: MatchRecord[];
  championIds: number[];
  updatedAt: number | null;
};

export type LoadedState = Omit<PersistedState, 'championIds'> & {
  /** 저장본에 챔피언 목록이 없으면 null (구버전 데이터 → 자동 파생) */
  championIds: number[] | null;
};

export function loadState(): LoadedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.records)) return null;
    return {
      accounts: parsed.accounts,
      records: parsed.records,
      championIds: Array.isArray(parsed.championIds) ? parsed.championIds : null,
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 용량 초과 등은 무시 (PRD §9) */
  }
}

export function clearState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
