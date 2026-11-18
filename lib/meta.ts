import type { Lane } from './types';

/** 집계 대상 큐 (PRD D6) */
export const TARGET_QUEUES = [420, 400, 430, 490] as const;

export const QUEUE_LABEL: Record<number, string> = {
  420: '솔로랭크',
  400: '일반',
  430: '일반(블라인드)',
  490: '빠른 대전',
  440: '자유랭크',
  450: '칼바람',
};

export const ROLE_LABEL: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MIDDLE: '미드',
  MID: '미드',
  BOTTOM: '원딜',
  ADC: '원딜',
  UTILITY: '서폿',
  SUPPORT: '서폿',
};

export const LANES: { key: Lane; label: string }[] = [
  { key: 'top', label: '탑' },
  { key: 'jungle', label: '정글' },
  { key: 'mid', label: '미드' },
  { key: 'adc', label: '원딜' },
  { key: 'sup', label: '서폿' },
];

/** PRD O9 — 시즌 시작일 (임시값, 설정 화면에서 조정 예정) */
export const SEASON_START = Date.parse('2026-01-08T00:00:00+09:00');

/** 리메이크 판정 기준 (초) */
export const REMAKE_SECONDS = 300;

export function formatDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${formatDate(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function pct(wins: number, games: number): string {
  if (!games) return '—';
  return `${((wins / games) * 100).toFixed(1)}%`;
}
