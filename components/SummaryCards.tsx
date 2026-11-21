'use client';

import { DDRAGON_VERSION } from '@/lib/champions';
import { formatDate, pct } from '@/lib/meta';
import type { Summary } from '@/lib/types';

type Props = {
  summary: Summary;
  periodLabel: string;
  championCount: number;
};

export default function SummaryCards({ summary, periodLabel, championCount }: Props) {
  const { games, wins, losses, winRate, latestMatchAt } = summary;

  return (
    <div className="summary-grid">
      <div className="stat-card">
        <div className="stat-label">총 연습 판수</div>
        <div className="stat-value">
          {games}
          <small>판</small>
        </div>
        <div className="stat-sub">
          {periodLabel} · 연습 챔피언 {championCount}개 합산
        </div>
      </div>

      <div className={`stat-card ${winRate >= 55 ? 'stat-card--win' : winRate <= 45 && games > 0 ? 'stat-card--loss' : ''}`}>
        <div className="stat-label">승률</div>
        <div className="stat-value">
          {games ? winRate.toFixed(1) : '—'}
          <small>%</small>
        </div>
        <div className="stat-sub">{games ? `${games}판 표본` : '아직 데이터가 없습니다'}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">승 / 패</div>
        <div className="stat-value stat-record">
          <span className="stat-record-win">
            {wins}
            <small>승</small>
          </span>
          <span className="stat-record-sep" aria-hidden="true">
            /
          </span>
          <span className="stat-record-loss">
            {losses}
            <small>패</small>
          </span>
        </div>
        <div className="stat-sub">
          {games ? `${games}판 · 패율 ${pct(losses, games)}` : '아직 데이터가 없습니다'}
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-label">최근 경기</div>
        <div className="stat-value" style={{ fontSize: 24 }}>
          {latestMatchAt ? formatDate(latestMatchAt) : '—'}
        </div>
        <div className="stat-sub">Data Dragon {DDRAGON_VERSION}</div>
      </div>
    </div>
  );
}
