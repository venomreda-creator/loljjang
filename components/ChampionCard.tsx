'use client';

import { championLanes, portraitUrl } from '@/lib/champions';
import { pct } from '@/lib/meta';
import type { ChampionMeta, ChampionStat } from '@/lib/types';

type Props = {
  stat: ChampionStat;
  meta?: ChampionMeta;
  onClick: (championId: number) => void;
};

export default function ChampionCard({ stat, meta, onClick }: Props) {
  const { championId, games, wins, losses, winRate } = stat;
  const name = meta?.name ?? `챔피언 ${championId}`;
  const lanes = meta ? championLanes(championId) : [];

  const wrClass =
    games === 0 ? 'wr--none' : winRate >= 55 ? 'wr--good' : winRate <= 45 ? 'wr--bad' : '';

  return (
    <button type="button" className="champ-card" onClick={() => onClick(championId)}>
      <div className="champ-top">
        {meta ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="portrait" src={portraitUrl(meta.alias)} alt="" loading="lazy" width={48} height={48} />
        ) : (
          <div className="portrait" />
        )}

        <div className="champ-id">
          <span className="champ-name">{name}</span>
          <div className="champ-lanes">
            {games > 0 && stat.matches[0]?.role ? (
              <span className="lane-tag">{roleLabel(stat.matches[0].role)}</span>
            ) : (
              lanes.slice(0, 2).map((l) => (
                <span key={l} className="lane-tag">
                  {l}
                </span>
              ))
            )}
          </div>
        </div>

        <div className={`wr ${wrClass}`}>{games ? pct(wins, games) : '—'}</div>
      </div>

      <div className={`bar ${games === 0 ? 'bar--empty' : ''}`}>
        <div className="bar-fill" style={{ width: `${games ? winRate : 0}%` }} />
      </div>

      <div className="champ-foot">
        <span>
          <b>{games}</b>판
        </span>
        <span>
          {wins}승 {losses}패
        </span>
      </div>
    </button>
  );
}

const ROLE: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MIDDLE: '미드',
  BOTTOM: '원딜',
  UTILITY: '서폿',
};

function roleLabel(role: string): string {
  return ROLE[role] ?? role;
}
