import { RiotError, jsonFail, jsonOk, resolveAccount } from '@/lib/server/riot';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { gameName?: string; tagLine?: string };
    const gameName = (body.gameName ?? '').trim();
    const tagLine = (body.tagLine ?? '').trim();

    if (!gameName || !tagLine) {
      throw new RiotError('BAD_REQUEST', 'gameName 과 tagLine 이 필요합니다.', 400);
    }
    if (gameName.length > 16 || tagLine.length > 8) {
      throw new RiotError('BAD_REQUEST', 'Riot ID 형식이 올바르지 않습니다.', 400);
    }

    const account = await resolveAccount(gameName, tagLine);
    return jsonOk({ account });
  } catch (err) {
    return jsonFail(err);
  }
}
