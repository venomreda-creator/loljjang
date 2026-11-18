#!/usr/bin/env node
/**
 * 수집 파이프라인 PoC
 *
 *   Riot ID → puuid → 매치 ID 목록 → 매치 상세 → 압축 레코드 → 집계
 *
 * 사용:
 *   node poc/collect.mjs --accounts "Hide on bush#KR1,내계정#KR1" --count 20
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RateLimiter, RiotClient, RiotError } from './riot.mjs';

const QUEUES = [420, 400, 430, 490];
const QUEUE_NAMES = { 420: '솔로랭크', 400: '일반(드래프트)', 430: '일반(블라인드)', 490: '빠른 대전' };

const HELP = `
loljjang 수집 파이프라인 PoC

옵션
  --accounts   "이름#태그,이름#태그"   (필수)
  --count      계정·큐당 조회할 경기 수 (기본 20)
  --queues     420,400,430,490 (기본 전체)
  --season-start  YYYY-MM-DD  (지정 시 이후 경기만 집계)
  --champs     103,157   (지정 시 해당 챔피언만 집계)
  --out        출력 디렉터리 (기본 poc/out)
  --key        API 키 (미지정 시 .env / 환경변수 사용)
  -h, --help

예시
  node poc/collect.mjs --accounts "Hide on bush#KR1" --count 20
`;

// ---------- 유틸 ----------
function loadEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !process.env[k]) process.env[k] = v;
  }
}

function parseArgs(argv) {
  const out = { accounts: '', count: 20, queues: QUEUES.join(','), 'season-start': '', champs: '', out: 'poc/out' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') return { help: true };
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const dispWidth = (s) =>
  [...String(s)].reduce(
    (w, ch) => w + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1),
    0,
  );
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - dispWidth(s)));
const pct = (w, t) => (t === 0 ? '—' : `${((w / t) * 100).toFixed(1)}%`);
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

function progress(done, total, label) {
  const w = 24;
  const ratio = total ? Math.min(done / total, 1) : 0;
  const filled = Math.round(ratio * w);
  const line = `  [${'█'.repeat(filled)}${'░'.repeat(w - filled)}] ${String(done).padStart(4)}/${total} ${label}`;
  process.stdout.write(`\r${line.padEnd(dispWidth(line) + 20, ' ')}`);
}

// ---------- 파이프라인 ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  loadEnv();

  const apiKey = (typeof args.key === 'string' && args.key) || process.env.RIOT_API_KEY;
  if (!apiKey) {
    console.error('\n✖ RIOT_API_KEY 가 없습니다.');
    console.error('  .env 파일에 RIOT_API_KEY=RGAPI-... 를 넣거나 --key 로 전달하세요.');
    console.error('  (키는 절대 git 에 커밋하지 마세요)\n');
    process.exit(1);
  }

  const accountsSpec = String(args.accounts || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!accountsSpec.length) {
    console.error('✖ --accounts "이름#태그" 형식으로 계정을 지정하세요.');
    process.exit(1);
  }

  const parsedAccounts = accountsSpec.map((spec) => {
    const idx = spec.lastIndexOf('#');
    if (idx <= 0) {
      console.error(`✖ 형식 오류: "${spec}" → 이름#태그 형식이어야 합니다.`);
      process.exit(1);
    }
    return { gameName: spec.slice(0, idx).trim(), tagLine: spec.slice(idx + 1).trim() };
  });

  const perQueueCount = Number(args.count) || 20;
  const queues = String(args.queues)
    .split(',')
    .map((q) => Number(q.trim()))
    .filter((q) => Number.isInteger(q) && QUEUES.includes(q));
  const seasonStart = args['season-start'] ? Date.parse(args['season-start']) : null;
  const champFilter = args.champs
    ? new Set(
        String(args.champs)
          .split(',')
          .map((c) => Number(c.trim()))
          .filter(Boolean),
      )
    : null;
  const outDir = String(args.out);
  const maxMatchesPerAccount = perQueueCount * queues.length;

  console.log(`\n=== loljjang 수집 PoC ===`);
  console.log(`계정       : ${accountsSpec.join(', ')}`);
  console.log(`대상 큐    : ${queues.map((q) => `${q}(${QUEUE_NAMES[q] || q})`).join(', ')}`);
  console.log(`백필       : 큐당 ${perQueueCount}경기 (계정당 최대 ${maxMatchesPerAccount})`);
  console.log(`시즌 시작  : ${seasonStart ? new Date(seasonStart).toISOString() : '제한 없음'}`);
  const totalCalls = parsedAccounts.length * (2 + queues.length) + parsedAccounts.length * maxMatchesPerAccount;
  console.log(`예상 소요  : 약 ${Math.ceil((totalCalls * 1250) / 1000)}초 (개발용 키 레이트 리밋 기준)`);

  const client = new RiotClient(apiKey, new RateLimiter());

  // 0) 챔피언 이름표
  console.log(`\n[0/3] Data Dragon 챔피언 목록`);
  let champions = new Map();
  let ddVersion = '?';
  try {
    const res = await client.getChampions();
    champions = res.map;
    ddVersion = res.version;
    console.log(`  · 패치 ${ddVersion} · 챔피언 ${champions.size}종`);
  } catch (err) {
    console.log(`  · 경고: 챔피언 목록 조회 실패 (${err.message}) → ID로 표시`);
  }

  // 1) 계정 해석
  console.log(`\n[1/3] 계정 해석`);
  const accounts = [];
  for (const spec of parsedAccounts) {
    const label = `${spec.gameName}#${spec.tagLine}`;
    try {
      const acc = await client.resolveAccount(spec.gameName, spec.tagLine);
      let summoner = null;
      try {
        summoner = await client.getSummoner(acc.puuid);
      } catch {
        /* 소환사 정보는 없어도 진행 */
      }
      accounts.push({
        ...spec,
        puuid: acc.puuid,
        gameName: acc.gameName,
        tagLine: acc.tagLine,
        summonerLevel: summoner?.summonerLevel ?? null,
        profileIconId: summoner?.profileIconId ?? null,
        status: 'ok',
      });
      console.log(`  ✔ ${label} · puuid=${acc.puuid.slice(0, 12)}… · Lv.${summoner?.summonerLevel ?? '?'}`);
    } catch (err) {
      const code = err instanceof RiotError ? err.code : 'UNKNOWN';
      console.log(`  ✖ ${label} · ${err.message}`);
      if (code === 'INVALID_KEY') {
        console.error('\n✖ API 키가 유효하지 않습니다. .env 의 RIOT_API_KEY 를 확인하세요.\n');
        process.exit(1);
      }
      accounts.push({ ...spec, puuid: null, status: code === 'NOT_FOUND' ? 'not_found' : 'error', lastError: err.message });
    }
  }

  const usable = accounts.filter((a) => a.puuid);
  if (!usable.length) {
    console.error('\n✖ 수집 가능한 계정이 없습니다. 종료합니다.');
    process.exit(1);
  }

  // 2) 매치 ID 수집
  console.log(`\n[2/3] 매치 ID 수집`);
  const idQueue = []; // { matchId, puuid, account }
  let idRequests = 0;
  for (const acc of usable) {
    for (const q of queues) {
      try {
        const ids = await client.getMatchIds(acc.puuid, { count: perQueueCount, queue: q });
        idRequests++;
        for (const id of ids) idQueue.push({ matchId: id, puuid: acc.puuid, account: `${acc.gameName}#${acc.tagLine}` });
        console.log(`  · ${acc.gameName}#${acc.tagLine} / ${QUEUE_NAMES[q]} → ${ids.length}건`);
      } catch (err) {
        console.log(`  ✖ ${acc.gameName}#${acc.tagLine} / ${QUEUE_NAMES[q]} → ${err.message}`);
      }
    }
  }

  // 중복 matchId 제거 (계정별로는 유지되어야 하므로 matchId:puuid 기준)
  const seen = new Set();
  const uniqueIds = [];
  for (const item of idQueue) {
    const key = `${item.matchId}:${item.puuid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueIds.push(item);
  }
  console.log(`  · 수집 대상: ${uniqueIds.length}건 (중복 제거 ${idQueue.length - uniqueIds.length}건)`);

  // 3) 매치 상세 → 압축 레코드
  console.log(`\n[3/3] 매치 상세 수집`);
  const records = [];
  let remakes = 0;
  let outOfSeason = 0;
  let notInMatch = 0;
  let detailErrors = 0;
  const queueSeen = new Map();

  for (let i = 0; i < uniqueIds.length; i++) {
    const { matchId, puuid } = uniqueIds[i];
    if (i % 5 === 0 || i === uniqueIds.length - 1) progress(i + 1, uniqueIds.length, `상세 조회 (성공 ${records.length})`);

    try {
      const match = await client.getMatch(matchId);
      const info = match.info ?? {};
      const queueId = info.queueId;
      queueSeen.set(queueId, (queueSeen.get(queueId) ?? 0) + 1);

      if (!QUEUES.includes(queueId)) continue;

      const me = (info.participants ?? []).find((p) => p.puuid === puuid);
      if (!me) {
        notInMatch++;
        continue;
      }
      if (Number(info.gameDuration) > 0 && Number(info.gameDuration) < 300) {
        remakes++;
        continue;
      }
      const gameEndAt = info.gameEndTimestamp ?? info.gameCreation ?? 0;
      if (seasonStart && gameEndAt < seasonStart) {
        outOfSeason++;
        continue;
      }

      records.push({
        matchId,
        puuid,
        championId: me.championId,
        win: Boolean(me.win),
        queueId,
        gameEndAt,
        role: me.teamPosition || me.individualPosition || '',
        kda: [me.kills ?? 0, me.deaths ?? 0, me.assists ?? 0],
      });
    } catch (err) {
      detailErrors++;
      if (detailErrors <= 3) {
        process.stdout.write('\n');
        console.log(`  ✖ ${matchId} → ${err.message}`);
      }
    }
  }
  process.stdout.write('\n');

  // ---------- 집계 ----------
  const byChampion = new Map();
  const byAccount = new Map();

  for (const r of records) {
    const target = champFilter ? champFilter.has(r.championId) : true;
    if (!target) continue;

    const c = byChampion.get(r.championId) ?? { games: 0, wins: 0 };
    c.games++;
    if (r.win) c.wins++;
    byChampion.set(r.championId, c);

    const accLabel = accounts.find((a) => a.puuid === r.puuid);
    const key = accLabel ? `${accLabel.gameName}#${accLabel.tagLine}` : r.puuid.slice(0, 8);
    const a = byAccount.get(key) ?? { games: 0, wins: 0 };
    a.games++;
    if (r.win) a.wins++;
    byAccount.set(key, a);
  }

  const cname = (id) => champions.get(id)?.name ?? `#${id}`;
  const champRows = [...byChampion.entries()].sort((a, b) => b[1].games - a[1].games);

  console.log(`\n=== 집계 결과 (전체 계정 합산) ===`);
  if (!champRows.length) {
    console.log('  수집된 경기가 없습니다.');
  } else {
    console.log(`  ${pad('챔피언', 16)}${pad('판수', 8)}${pad('승', 6)}${pad('패', 6)}${pad('승률', 8)}`);
    console.log(`  ${'-'.repeat(44)}`);
    for (const [id, s] of champRows) {
      console.log(
        `  ${pad(cname(id), 16)}${pad(s.games, 8)}${pad(s.wins, 6)}${pad(s.games - s.wins, 6)}${pad(pct(s.wins, s.games), 8)}`,
      );
    }
  }

  console.log(`\n=== 계정별 ===`);
  console.log(`  ${pad('계정', 24)}${pad('판수', 8)}${pad('승', 6)}${pad('패', 6)}${pad('승률', 8)}`);
  console.log(`  ${'-'.repeat(52)}`);
  for (const [label, s] of byAccount) {
    console.log(
      `  ${pad(label, 24)}${pad(s.games, 8)}${pad(s.wins, 6)}${pad(s.games - s.wins, 6)}${pad(pct(s.wins, s.games), 8)}`,
    );
  }

  // ---------- 저장 ----------
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outAccounts = accounts.map((a) => ({
    gameName: a.gameName,
    tagLine: a.tagLine,
    puuid: a.puuid,
    region: process.env.RIOT_PLATFORM || 'kr',
    summonerLevel: a.summonerLevel ?? null,
    status: a.status,
    lastError: a.lastError ?? null,
  }));
  writeFileSync(join(outDir, 'accounts.json'), JSON.stringify(outAccounts, null, 2), 'utf8');
  writeFileSync(join(outDir, 'records.json'), JSON.stringify(records, null, 2), 'utf8');

  const total = champRows.reduce((s, [, v]) => s + v.games, 0);
  const wins = champRows.reduce((s, [, v]) => s + v.wins, 0);

  console.log(`\n=== 실행 요약 ===`);
  console.log(`  API 요청      : ${client.requestCount}회`);
  console.log(`  소요 시간     : ${secs(Date.now() - client.startedAt)}`);
  console.log(`  수집 레코드   : ${records.length}건`);
  console.log(`  집계 판수     : ${total}판 · ${wins}승 ${total - wins}패 · 승률 ${pct(wins, total)}`);
  console.log(`  제외          : 리메이크 ${remakes} · 시즌 이전 ${outOfSeason} · 큐 제외 ${[...queueSeen.entries()].filter(([q]) => !QUEUES.includes(q)).reduce((s, [, n]) => s + n, 0)} · 참가자 불일치 ${notInMatch} · 오류 ${detailErrors}`);
  console.log(`  저장          : ${outDir}/accounts.json, ${outDir}/records.json\n`);
}

main().catch((err) => {
  console.error(`\n✖ 중단: ${err.message}`);
  if (err.code) console.error(`  code=${err.code}`);
  process.exit(1);
});
