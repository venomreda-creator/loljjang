import { TARGET_QUEUES } from './meta';
import type { Account, AccountStat, ChampionStat, MatchRecord, Summary } from './types';

const TARGET = new Set<number>(TARGET_QUEUES);

export function isCounted(record: MatchRecord, since?: number): boolean {
  if (!TARGET.has(record.queueId)) return false;
  if (since && record.gameEndAt < since) return false;
  return true;
}

export function filterRecords(records: MatchRecord[], since?: number): MatchRecord[] {
  return records.filter((r) => isCounted(r, since));
}

export function aggregateSummary(records: MatchRecord[]): Summary {
  let wins = 0;
  let latestMatchAt = 0;
  for (const r of records) {
    if (r.win) wins++;
    if (r.gameEndAt > latestMatchAt) latestMatchAt = r.gameEndAt;
  }
  const games = records.length;
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games ? (wins / games) * 100 : 0,
    latestMatchAt,
  };
}

export function aggregateByChampion(records: MatchRecord[], championIds: number[]): ChampionStat[] {
  const map = new Map<number, ChampionStat>();
  for (const id of championIds) {
    map.set(id, {
      championId: id,
      games: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      lastPlayedAt: 0,
      matches: [],
    });
  }

  for (const r of records) {
    const stat = map.get(r.championId);
    if (!stat) continue;
    stat.games++;
    if (r.win) stat.wins++;
    if (r.gameEndAt > stat.lastPlayedAt) stat.lastPlayedAt = r.gameEndAt;
    stat.matches.push(r);
  }

  for (const stat of map.values()) {
    stat.losses = stat.games - stat.wins;
    stat.winRate = stat.games ? (stat.wins / stat.games) * 100 : 0;
    stat.matches.sort((a, b) => b.gameEndAt - a.gameEndAt);
  }

  return [...map.values()];
}

export function aggregateByAccount(records: MatchRecord[], accounts: Account[]): AccountStat[] {
  const map = new Map<string, AccountStat>();
  for (const account of accounts) {
    map.set(account.puuid, {
      account,
      games: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      lastPlayedAt: 0,
    });
  }

  for (const r of records) {
    const stat = map.get(r.puuid);
    if (!stat) continue;
    stat.games++;
    if (r.win) stat.wins++;
    if (r.gameEndAt > stat.lastPlayedAt) stat.lastPlayedAt = r.gameEndAt;
  }

  for (const stat of map.values()) {
    stat.losses = stat.games - stat.wins;
    stat.winRate = stat.games ? (stat.wins / stat.games) * 100 : 0;
  }

  return [...map.values()];
}

/** 수집된 기록에서 가장 많이 플레이한 챔피언 상위 N개 */
export function topChampionIds(records: MatchRecord[], limit = 10): number[] {
  const counts = new Map<number, number>();
  for (const r of records) {
    counts.set(r.championId, (counts.get(r.championId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
