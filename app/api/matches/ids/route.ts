import { getMatchIds, jsonFail, jsonOk, RiotError } from '@/lib/server/riot';
import { TARGET_QUEUES } from '@/lib/meta';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { puuid?: string; count?: number; queues?: number[] };
    const puuid = (body.puuid ?? '').trim();

    if (!puuid) throw new RiotError('BAD_REQUEST', 'puuid 가 필요합니다.', 400);

    const count = Math.min(Math.max(Number(body.count) || 20, 1), 50);
    const queues = (body.queues?.length ? body.queues : [...TARGET_QUEUES]).filter((q) =>
      (TARGET_QUEUES as readonly number[]).includes(q),
    );

    if (!queues.length) throw new RiotError('BAD_REQUEST', '지원하지 않는 큐입니다.', 400);

    const result: Record<number, string[]> = {};
    for (const queue of queues) {
      result[queue] = await getMatchIds(puuid, count, queue);
    }

    return jsonOk({ ids: result });
  } catch (err) {
    return jsonFail(err);
  }
}
