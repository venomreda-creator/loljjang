import { getMatchRecord, jsonFail, jsonOk, RiotError } from '@/lib/server/riot';
import type { MatchRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** 서버리스 타임아웃(≈10초)과 레이트 리밋(1.2초/요청)을 고려한 배치 상한 */
const MAX_BATCH = 5;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { puuid?: string; matchIds?: string[] };
    const puuid = (body.puuid ?? '').trim();
    const matchIds = (body.matchIds ?? []).slice(0, MAX_BATCH);

    if (!puuid) throw new RiotError('BAD_REQUEST', 'puuid 가 필요합니다.', 400);
    if (!matchIds.length) throw new RiotError('BAD_REQUEST', 'matchIds 가 필요합니다.', 400);

    const records: MatchRecord[] = [];
    const skipped = { remake: 0, queue: 0, missing: 0 };
    const failed: string[] = [];

    for (const matchId of matchIds) {
      try {
        const { record, reason } = await getMatchRecord(matchId, puuid);
        if (record) {
          records.push(record);
        } else if (reason === 'remake') {
          skipped.remake++;
        } else if (reason === 'not_target_queue') {
          skipped.queue++;
        } else {
          skipped.missing++;
        }
      } catch (err) {
        // 인증/한도 오류는 배치 전체를 중단해야 의미가 있다
        if (err instanceof RiotError && (err.code === 'INVALID_KEY' || err.code === 'RATE_LIMIT')) {
          throw err;
        }
        failed.push(matchId);
      }
    }

    return jsonOk({ records, skipped, failed });
  } catch (err) {
    return jsonFail(err);
  }
}
