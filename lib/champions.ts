import championsData from '@/data/champions.json';
import type { ChampionMeta } from './types';

export const DDRAGON_VERSION: string = championsData.version;

export const CHAMPIONS: ChampionMeta[] = championsData.champions as unknown as ChampionMeta[];

export const CHAMPION_BY_ID = new Map<number, ChampionMeta>(CHAMPIONS.map((c) => [c.id, c]));

export const CHAMPION_BY_NAME = new Map<string, ChampionMeta>(CHAMPIONS.map((c) => [c.name, c]));

export function portraitUrl(alias: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${alias}.png`;
}

export function championName(id: number): string {
  return CHAMPION_BY_ID.get(id)?.name ?? `챔피언 ${id}`;
}

export function championLanes(id: number): string[] {
  const lanes = CHAMPION_BY_ID.get(id)?.lanes ?? [];
  const label: Record<string, string> = { top: '탑', jungle: '정글', mid: '미드', adc: '원딜', sup: '서폿' };
  return lanes.map((l) => label[l] ?? l);
}
