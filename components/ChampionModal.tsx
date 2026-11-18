'use client';

import { useEffect } from 'react';
import { championLanes, portraitUrl } from '@/lib/champions';
import { QUEUE_LABEL, ROLE_LABEL, formatDateTime, pct } from '@/lib/meta';
import type { Account, ChampionMeta, ChampionStat } from '@/lib/types';

type Props = {
  stat: ChampionStat;
  meta?: ChampionMeta;
  accounts: Account[];
  onClose: () => void;
};

export default function ChampionModal({ stat, meta, accounts, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const accountName = (puuid: string) => {
    const acc = accounts.find((a) => a.puuid === puuid);
    return acc ? `${acc.gameName}#${acc.tagLine}` : puuid.slice(0, 8);
  };

  const name = meta?.name ?? `챔피언 ${stat.championId}`;

  return (
    <div className="backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 상세 기록`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {meta ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="portrait" src={portraitUrl(meta.alias)} alt="" width={54} height={54} />
          ) : (
            <div className="portrait" />
          )}
          <div className="modal-title">
            <h3>{name}</h3>
            <p>{championLanes(stat.championId).join(' · ') || '포지션 정보 없음'}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <dl className="modal-stats">
          <div className="modal-stat">
            <dt>판수</dt>
            <dd>{stat.games}</dd>
          </div>
          <div className="modal-stat">
            <dt>승 / 패</dt>
            <dd>
              {stat.wins} / {stat.losses}
            </dd>
          </div>
          <div className="modal-stat">
            <dt>승률</dt>
            <dd style={{ color: stat.games ? undefined : 'var(--muted)' }}>
              {stat.games ? pct(stat.wins, stat.games) : '—'}
            </dd>
          </div>
          <div className="modal-stat">
            <dt>최근 플레이</dt>
            <dd style={{ fontSize: 15 }}>
              {stat.lastPlayedAt ? formatDateTime(stat.lastPlayedAt) : '—'}
            </dd>
          </div>
        </dl>

        <div className="modal-body">
          {stat.matches.length === 0 ? (
            <div className="empty" style={{ margin: 16, border: 0 }}>
              <strong>이 기간에 기록이 없습니다</strong>
              기간을 &lsquo;전체&rsquo;로 바꾸거나 새로고침으로 전적을 수집해 보세요.
            </div>
          ) : (
            <ul className="match-list">
              {stat.matches.slice(0, 20).map((m) => (
                <li key={m.matchId} className="match-row">
                  <span className={`result ${m.win ? 'result--win' : 'result--loss'}`}>
                    {m.win ? '승' : '패'}
                  </span>
                  <div className="match-meta">
                    <div className="match-title">
                      {QUEUE_LABEL[m.queueId] ?? `큐 ${m.queueId}`}
                      {m.role ? <span className="lane-tag">{ROLE_LABEL[m.role] ?? m.role}</span> : null}
                    </div>
                    <div className="match-sub">
                      {accountName(m.puuid)} · {formatDateTime(m.gameEndAt)}
                    </div>
                  </div>
                  {m.kda ? (
                    <span className="kda">
                      <b>{m.kda[0]}</b> / {m.kda[1]} / {m.kda[2]}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
