import type { MatchRecord } from '@/lib/types';
import { TARGET_QUEUES, REMAKE_SECONDS } from '@/lib/meta';

export type RiotErrorCode =
  | 'INVALID_KEY'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'UPSTREAM'
  | 'NETWORK'
  | 'BAD_REQUEST'
  /** Riot 이 puuid 를 해독하지 못함 — 계정 이전/통합 등으로 식별자가 바뀐 경우 */
  | 'STALE_PUUID';

export class RiotError extends Error {
  constructor(
    public code: RiotErrorCode,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = 'RiotError';
  }
}

const REGION = process.env.RIOT_REGION || 'asia';
const PLATFORM = process.env.RIOT_PLATFORM || 'kr';
const USER_AGENT = 'loljjang/0.1 (practice tracker)';
const TARGET = new Set<number>(TARGET_QUEUES);

/* ── 레이트 리밋 (개발용 키: 100req/2min) ───────────────────────── */
class RateLimiter {
  private calls: number[] = [];
  private last = 0;

  constructor(
    private minInterval = 1200,
    private windowLimit = 95,
    private windowMs = 120_000,
  ) {}

  async wait(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.calls.length && now - this.calls[0] >= this.windowMs) this.calls.shift();

      if (this.calls.length >= this.windowLimit) {
        await sleep(this.windowMs - (now - this.calls[0]) + 50);
        continue;
      }
      const gap = this.minInterval - (now - this.last);
      if (gap > 0) {
        await sleep(gap);
        continue;
      }
      break;
    }
    const t = Date.now();
    this.calls.push(t);
    this.last = t;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Route Handler 마다 모듈 인스턴스가 분리될 수 있으므로
 * globalThis 에 보관해 프로세스 내 단일 리미터를 공유한다.
 */
const globalRef = globalThis as typeof globalThis & { __loljjangLimiter?: RateLimiter };
const limiter = (globalRef.__loljjangLimiter ??= new RateLimiter());

/* ── HTTP ──────────────────────────────────────────────────── */
function apiKey(): string {
  const key = process.env.RIOT_API_KEY ?? '';
  if (!key) {
    throw new RiotError('INVALID_KEY', '서버에 RIOT_API_KEY 가 설정되지 않았습니다.', 500);
  }
  if (!/^[\x21-\x7E]+$/.test(key)) {
    throw new RiotError('INVALID_KEY', 'RIOT_API_KEY 에 허용되지 않는 문자(한글/공백)가 있습니다.', 500);
  }
  return key;
}

async function call<T>(url: string, retries = 2): Promise<T> {
  const key = apiKey();

  for (let attempt = 0; attempt <= retries; attempt++) {
    await limiter.wait();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'X-Riot-Token': key, 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
    } catch (err) {
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new RiotError('NETWORK', `Riot API 연결 실패: ${(err as Error).message}`, 504);
    }

    if (res.ok) return (await res.json()) as T;

    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 5);
      await sleep(wait * 1000 + 500);
      if (attempt < retries) continue;
      throw new RiotError('RATE_LIMIT', 'Riot API 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.', 429);
    }
    if ([500, 502, 503, 504].includes(res.status)) {
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new RiotError('UPSTREAM', `Riot API 서버 오류 (${res.status})`, 502);
    }
    if (res.status === 401) {
      throw new RiotError('INVALID_KEY', 'API 키가 만료되었거나 유효하지 않습니다. .env 의 RIOT_API_KEY 를 갱신하세요.', 401);
    }
    if (res.status === 403) {
      throw new RiotError('FORBIDDEN', '비공개 계정이거나 접근이 거부되었습니다.', 403);
    }
    if (res.status === 404) {
      throw new RiotError('NOT_FOUND', 'Riot ID 또는 매치를 찾을 수 없습니다.', 404);
    }
    if (res.status === 400) {
      // Riot 은 계정 이전 등으로 puuid 인코딩이 바뀌면 400 + "Exception decrypting" 을 준다.
      const body = await res.text().catch(() => '');
      if (body.includes('Exception decrypting')) {
        throw new RiotError(
          'STALE_PUUID',
          '계정 식별자(puuid)가 만료되었습니다. 계정을 삭제하고 다시 등록해 주세요.',
          409,
        );
      }
      throw new RiotError('BAD_REQUEST', `Riot API 요청이 거부되었습니다. ${body.slice(0, 160)}`, 400);
    }
    throw new RiotError('UPSTREAM', `Riot API 오류 (${res.status})`, 502);
  }

  throw new RiotError('UPSTREAM', '알 수 없는 오류', 502);
}

/* ── 공개 API ───────────────────────────────────────────────── */
export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number | null;
  profileIconId: number | null;
};

export async function resolveAccount(gameName: string, tagLine: string): Promise<RiotAccount> {
  const acc = await call<{ puuid: string; gameName: string; tagLine: string }>(
    `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName,
    )}/${encodeURIComponent(tagLine)}`,
  );

  let summonerLevel: number | null = null;
  let profileIconId: number | null = null;
  try {
    const s = await call<{ summonerLevel: number; profileIconId: number }>(
      `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`,
    );
    summonerLevel = s.summonerLevel ?? null;
    profileIconId = s.profileIconId ?? null;
  } catch {
    /* 소환사 정보는 부가 정보 — 실패해도 계정 등록은 진행 */
  }

  return { puuid: acc.puuid, gameName: acc.gameName, tagLine: acc.tagLine, summonerLevel, profileIconId };
}

export async function getMatchIds(puuid: string, count: number, queue: number): Promise<string[]> {
  return call<string[]>(
    `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}&queue=${queue}`,
  );
}

type MatchDetail = {
  metadata?: { matchId: string };
  info?: {
    queueId: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    gameCreation?: number;
    participants?: Array<{
      puuid: string;
      championId: number;
      win: boolean;
      teamPosition?: string;
      individualPosition?: string;
      kills?: number;
      deaths?: number;
      assists?: number;
    }>;
  };
};

export type ExtractResult = { record: MatchRecord | null; reason?: 'not_target_queue' | 'remake' | 'not_in_match' };

export function extractRecord(match: MatchDetail, matchId: string, puuid: string): ExtractResult {
  const info = match.info;
  if (!info) return { record: null, reason: 'not_in_match' };
  if (!TARGET.has(info.queueId)) return { record: null, reason: 'not_target_queue' };
  if (Number(info.gameDuration) > 0 && Number(info.gameDuration) < REMAKE_SECONDS) {
    return { record: null, reason: 'remake' };
  }

  const me = info.participants?.find((p) => p.puuid === puuid);
  if (!me) return { record: null, reason: 'not_in_match' };

  return {
    record: {
      matchId,
      puuid,
      championId: me.championId,
      win: Boolean(me.win),
      queueId: info.queueId,
      gameEndAt: info.gameEndTimestamp ?? info.gameCreation ?? 0,
      role: me.teamPosition || me.individualPosition || '',
      kda: [me.kills ?? 0, me.deaths ?? 0, me.assists ?? 0],
    },
  };
}

export async function getMatchRecord(matchId: string, puuid: string): Promise<ExtractResult> {
  const match = await call<MatchDetail>(
    `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
  );
  return extractRecord(match, matchId, puuid);
}

/* ── 응답 헬퍼 ─────────────────────────────────────────────── */
export function jsonOk(data: Record<string, unknown>, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...data }, init);
}

export function jsonFail(err: unknown): Response {
  const e =
    err instanceof RiotError
      ? err
      : new RiotError('UPSTREAM', (err as Error)?.message ?? '알 수 없는 오류');

  return Response.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
}
