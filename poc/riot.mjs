/**
 * Riot API 클라이언트 (PoC)
 * - 레이트 리밋 자체 준수 (개발용 키: 100req/2min)
 * - 429 / 5xx 재시도
 * - PRD 7장과 동일한 에러 코드 정규화
 */

export const REGION = process.env.RIOT_REGION || 'asia'; // 계정/매치 라우팅 (KR → asia)
export const PLATFORM = process.env.RIOT_PLATFORM || 'kr'; // 소환사 라우팅

const DDRAGON = 'https://ddragon.leagueoflegends.com';
const USER_AGENT = 'loljjang-poc/0.1';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RiotError extends Error {
  constructor(code, message, status) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.status = status;
  }
}

export class RateLimiter {
  constructor({ minInterval = 1250, windowLimit = 95, windowMs = 120_000 } = {}) {
    this.minInterval = minInterval;
    this.windowLimit = windowLimit;
    this.windowMs = windowMs;
    this.calls = [];
    this.last = 0;
  }

  async wait() {
    for (;;) {
      const now = Date.now();
      while (this.calls.length && now - this.calls[0] >= this.windowMs) this.calls.shift();

      if (this.calls.length >= this.windowLimit) {
        const need = this.windowMs - (now - this.calls[0]) + 50;
        await sleep(Math.max(need, 0));
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

export class RiotClient {
  constructor(apiKey, limiter = new RateLimiter()) {
    if (!apiKey) throw new RiotError('INVALID_KEY', 'RIOT_API_KEY 가 설정되지 않았습니다.');
    // HTTP 헤더는 ASCII만 허용 → 한글 플레이스홀더 등이 섞이면 즉시 명확히 안내
    if (!/^[\x21-\x7E]+$/.test(apiKey)) {
      throw new RiotError(
        'INVALID_KEY',
        'API 키에 허용되지 않는 문자(한글/공백/줄바꿈 등)가 포함되어 있습니다. .env 를 확인하세요.',
      );
    }
    this.apiKey = apiKey;
    this.limiter = limiter;
    this.requestCount = 0;
    this.startedAt = Date.now();
  }

  async get(url, { retries = 3, auth = true } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      await this.limiter.wait();

      const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
      if (auth) headers['X-Riot-Token'] = this.apiKey;

      let res;
      try {
        this.requestCount++;
        res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          lastError = new RiotError('NETWORK', `네트워크 오류: ${err.message}`);
          continue;
        }
        throw new RiotError('NETWORK', `네트워크 오류: ${err.message}`);
      }

      if (res.ok) return res.json();

      const body = (await res.text().catch(() => '')).slice(0, 300);

      if (res.status === 429) {
        const waitSec = Number(res.headers.get('retry-after') || 5);
        console.log(`    · 429 rate limit → ${waitSec}s 대기`);
        await sleep(waitSec * 1000 + 500);
        lastError = new RiotError('RATE_LIMIT', body || 'rate limited', 429);
        continue;
      }
      if ([500, 502, 503, 504].includes(res.status)) {
        const backoff = 1000 * 2 ** attempt;
        console.log(`    · ${res.status} 서버 오류 → ${backoff / 1000}s 후 재시도`);
        await sleep(backoff);
        lastError = new RiotError('UPSTREAM', body || 'upstream error', res.status);
        continue;
      }
      if (res.status === 401) {
        throw new RiotError('INVALID_KEY', 'API 키가 만료되었거나 유효하지 않습니다.', 401);
      }
      if (res.status === 403) {
        throw new RiotError('FORBIDDEN', '비공개 계정이거나 접근이 거부되었습니다.', 403);
      }
      if (res.status === 404) {
        throw new RiotError('NOT_FOUND', body || 'not found', 404);
      }
      throw new RiotError('UPSTREAM', `HTTP ${res.status}: ${body}`, res.status);
    }

    throw lastError || new RiotError('UNKNOWN', '알 수 없는 오류');
  }

  // --- Riot ID → 계정 ---
  resolveAccount(gameName, tagLine) {
    const gn = encodeURIComponent(gameName);
    const tl = encodeURIComponent(tagLine);
    return this.get(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gn}/${tl}`,
    );
  }

  getSummoner(puuid) {
    return this.get(
      `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
    );
  }

  // --- 매치 ---
  getMatchIds(puuid, { count = 20, queue } = {}) {
    const q = queue ? `&queue=${queue}` : '';
    return this.get(
      `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}${q}`,
    );
  }

  getMatch(matchId) {
    return this.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
  }

  // --- Data Dragon (공개 API → 인증 헤더 불필요) ---
  async getChampions() {
    const versions = await this.get(`${DDRAGON}/api/versions.json`, { auth: false });
    const version = versions[0];
    const data = await this.get(`${DDRAGON}/cdn/${version}/data/ko_KR/champion.json`, { auth: false });
    const map = new Map();
    for (const c of Object.values(data.data)) {
      map.set(Number(c.key), { id: c.id, name: c.name, tags: c.tags ?? [] });
    }
    return { version, map };
  }
}
