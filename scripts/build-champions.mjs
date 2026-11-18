/**
 * 챔피언 메타데이터 생성 (Data Dragon 이름/태그 + Meraki 포지션)
 * 출력: data/champions.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const DD = 'https://ddragon.leagueoflegends.com';
const LANE_MAP = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'mid',
  MID: 'mid',
  BOTTOM: 'adc',
  ADC: 'adc',
  SUPPORT: 'sup',
  UTILITY: 'sup',
};

const versions = await (await fetch(`${DD}/api/versions.json`)).json();
const version = versions[0];
const champRaw = await (await fetch(`${DD}/cdn/${version}/data/ko_KR/champion.json`)).json();

const base = Object.values(champRaw.data).map((c) => ({
  id: Number(c.key),
  alias: c.id,
  name: c.name,
  tags: c.tags ?? [],
  lanes: [],
}));
const byId = new Map(base.map((c) => [c.id, c]));

let laneCount = 0;
try {
  const res = await fetch(
    'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json',
  );
  const json = await res.json();
  for (const entry of Object.values(json)) {
    const champ = byId.get(Number(entry.id));
    if (!champ || !Array.isArray(entry.positions)) continue;
    const lanes = entry.positions.map((p) => LANE_MAP[p]).filter(Boolean);
    champ.lanes = [...new Set(lanes)];
    if (champ.lanes.length) laneCount++;
  }
} catch (err) {
  console.warn('포지션 데이터 병합 실패:', err.message);
}

mkdirSync('data', { recursive: true });
writeFileSync(
  'data/champions.json',
  JSON.stringify({ version, champions: base.sort((a, b) => a.name.localeCompare(b.name, 'ko')) }),
  'utf8',
);
console.log(`wrote data/champions.json · ${base.length} champions · ${laneCount} with lanes · patch ${version}`);
