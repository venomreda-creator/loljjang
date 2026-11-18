'use client';

import { formatDate, pct } from '@/lib/meta';
import type { AccountStat } from '@/lib/types';

type Props = {
  stats: AccountStat[];
};

export default function AccountTable({ stats }: Props) {
  return (
    <div className="panel">
      <div className="table-scroll">
        <table className="accounts">
          <thead>
            <tr>
              <th scope="col">계정</th>
              <th scope="col" className="num">
                판수
              </th>
              <th scope="col" className="num">
                승
              </th>
              <th scope="col" className="num">
                패
              </th>
              <th scope="col" className="num">
                승률
              </th>
              <th scope="col" className="num">
                최근 경기
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.account.puuid}>
                <td>
                  <div className="acc-cell">
                    <span className="avatar" aria-hidden="true">
                      {s.account.gameName.slice(0, 1)}
                    </span>
                    <span>
                      <span className="acc-name">{s.account.gameName}</span>
                      <span className="acc-tag">#{s.account.tagLine}</span>
                    </span>
                  </div>
                </td>
                <td className="num">{s.games}</td>
                <td className="num cell-win">{s.wins}</td>
                <td className="num cell-loss">{s.losses}</td>
                <td className="num">{pct(s.wins, s.games)}</td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {formatDate(s.lastPlayedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
