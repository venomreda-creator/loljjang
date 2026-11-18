'use client';

import { useEffect, useMemo, useState } from 'react';
import AccountManager from './AccountManager';
import AccountTable from './AccountTable';
import ChampionCard from './ChampionCard';
import ChampionModal from './ChampionModal';
import ChampionPicker from './ChampionPicker';
import SummaryCards from './SummaryCards';
import { SyncErrorAlert, SyncProgressPanel } from './SyncPanel';
import {
  aggregateByAccount,
  aggregateByChampion,
  aggregateSummary,
  filterRecords,
} from '@/lib/aggregate';
import { CHAMPION_BY_ID, DDRAGON_VERSION } from '@/lib/champions';
import { LANES, SEASON_START, relativeTime } from '@/lib/meta';
import type { Account, Lane, MatchRecord } from '@/lib/types';
import { MAX_ACCOUNTS, MAX_CHAMPIONS, useCollection } from '@/lib/useCollection';

type Period = 'all' | 'season';
type SortKey = 'games' | 'winrate' | 'name';

type Props = {
  records: MatchRecord[];
  accounts: Account[];
};

export default function Dashboard({ records: seedRecords, accounts: seedAccounts }: Props) {
  const {
    accounts,
    records,
    championIds,
    updatedAt,
    progress,
    error,
    refresh,
    cancel,
    addAccount,
    removeAccount,
    toggleChampion,
    removeChampion,
    clearError,
  } = useCollection({ records: seedRecords, accounts: seedAccounts });

  const [period, setPeriod] = useState<Period>('all');
  const [query, setQuery] = useState('');
  const [lane, setLane] = useState<Lane | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('games');
  const [openId, setOpenId] = useState<number | null>(null);
  const [manager, setManager] = useState<'accounts' | 'champions' | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('loljjang:theme', next);
    } catch {
      /* 저장 실패 무시 */
    }
  }

  const seasonRecords = useMemo(() => filterRecords(records, SEASON_START), [records]);

  const gameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) counts[r.puuid] = (counts[r.puuid] ?? 0) + 1;
    return counts;
  }, [records]);

  const visible = period === 'all' ? records : seasonRecords;

  const championSet = useMemo(() => new Set(championIds), [championIds]);
  const practiceRecords = useMemo(
    () => visible.filter((r) => championSet.has(r.championId)),
    [visible, championSet],
  );

  const summary = useMemo(() => aggregateSummary(practiceRecords), [practiceRecords]);
  const stats = useMemo(
    () => aggregateByChampion(practiceRecords, championIds),
    [practiceRecords, championIds],
  );
  const accountStats = useMemo(
    () => aggregateByAccount(practiceRecords, accounts),
    [practiceRecords, accounts],
  );

  // 기간 토글 라벨: 연습 챔피언 기준 건수 (요약 카드와 숫자 일치)
  const allPracticeCount = practiceRecords.length;
  const seasonPracticeCount = useMemo(
    () => seasonRecords.filter((r) => championSet.has(r.championId)).length,
    [seasonRecords, championSet],
  );

  const filteredStats = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = stats.filter((s) => {
      const meta = CHAMPION_BY_ID.get(s.championId);
      if (!meta) return true;
      if (lane !== 'all' && !meta.lanes.includes(lane)) return false;
      if (!q) return true;
      return meta.name.toLowerCase().includes(q) || meta.alias.toLowerCase().includes(q);
    });

    return list.sort((a, b) => {
      if (sort === 'winrate') {
        if (a.games === 0 && b.games === 0) return 0;
        if (a.games === 0) return 1;
        if (b.games === 0) return -1;
        return b.winRate - a.winRate || b.games - a.games;
      }
      if (sort === 'name') {
        const an = CHAMPION_BY_ID.get(a.championId)?.name ?? '';
        const bn = CHAMPION_BY_ID.get(b.championId)?.name ?? '';
        return an.localeCompare(bn, 'ko');
      }
      return b.games - a.games;
    });
  }, [stats, query, lane, sort]);

  const openStat = openId === null ? null : stats.find((s) => s.championId === openId) ?? null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            LOLJJANG <small>챔피언 연습 기록</small>
          </div>
          <div className="spacer" />
          <span className="badge">
            수집 {records.length}경기 · {accounts.length}계정
          </span>
          <span className="badge badge--gold">Patch {DDRAGON_VERSION}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            style={{ marginLeft: 0 }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main className="shell">
        <section className="hero hero-row">
          <div>
            <h1>연습 대시보드</h1>
            <p>모든 계정을 합산한 챔피언별 연습 기록입니다. 카드를 눌러 최근 경기를 확인하세요.</p>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn" onClick={() => setManager('accounts')}>
              계정 {accounts.length}/{MAX_ACCOUNTS}
            </button>
            <button type="button" className="btn" onClick={() => setManager('champions')}>
              챔피언 {championIds.length}/{MAX_CHAMPIONS}
            </button>
            <span className="badge">
              {updatedAt ? `최근 갱신 ${relativeTime(updatedAt)}` : '아직 수집 전'}
            </span>
            <button
              type="button"
              className="btn btn--gold"
              onClick={refresh}
              disabled={Boolean(progress)}
            >
              {progress ? '수집 중…' : '↻ 새로고침'}
            </button>
          </div>
        </section>

        <SummaryCards
          summary={summary}
          periodLabel={period === 'all' ? '전체 기간' : '이번 시즌'}
          championCount={championIds.length}
        />

        {progress ? <SyncProgressPanel progress={progress} onCancel={cancel} /> : null}
        {error && !progress ? <SyncErrorAlert error={error} onDismiss={clearError} /> : null}

        <div className="toolbar">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              className="search"
              type="search"
              placeholder="챔피언 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="챔피언 검색"
            />
          </div>

          <div className="chips" role="group" aria-label="포지션 필터">
            <button
              type="button"
              className="chip"
              aria-pressed={lane === 'all'}
              onClick={() => setLane('all')}
            >
              전체
            </button>
            {LANES.map((l) => (
              <button
                key={l.key}
                type="button"
                className="chip"
                aria-pressed={lane === l.key}
                onClick={() => setLane(l.key)}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="toolbar-right">
            <select
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="정렬 기준"
            >
              <option value="games">판수순</option>
              <option value="winrate">승률순</option>
              <option value="name">이름순</option>
            </select>

            <div className="segmented" role="group" aria-label="집계 기간">
              <button type="button" aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
                전체 ({allPracticeCount})
              </button>
              <button
                type="button"
                aria-pressed={period === 'season'}
                onClick={() => setPeriod('season')}
              >
                이번 시즌 ({seasonPracticeCount})
              </button>
            </div>
          </div>
        </div>

        <div className="section-head">
          <h2>연습 챔피언</h2>
          <span>{championIds.length}개 · 전체 계정 합산</span>
        </div>

        {championIds.length === 0 ? (
          <div className="empty">
            <strong>연습 챔피언을 선택하세요</strong>
            최대 {MAX_CHAMPIONS}개까지 고를 수 있습니다.
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--gold" onClick={() => setManager('champions')}>
                챔피언 선택
              </button>
            </div>
          </div>
        ) : filteredStats.length === 0 ? (
          <div className="empty">
            <strong>조건에 맞는 챔피언이 없습니다</strong>
            검색어를 지우거나 다른 포지션을 선택해 보세요.
          </div>
        ) : (
          <div className="champ-grid">
            {filteredStats.map((stat) => (
              <ChampionCard
                key={stat.championId}
                stat={stat}
                meta={CHAMPION_BY_ID.get(stat.championId)}
                onClick={setOpenId}
              />
            ))}
          </div>
        )}

        <div className="section-head">
          <h2>계정별 비교</h2>
          <span>{accounts.length}개 계정</span>
        </div>

        {accounts.length === 0 ? (
          <div className="empty">
            <strong>등록된 계정이 없습니다</strong>
            Riot ID 를 등록하면 전적을 수집할 수 있습니다.
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--gold" onClick={() => setManager('accounts')}>
                계정 추가
              </button>
            </div>
          </div>
        ) : (
          <AccountTable stats={accountStats} />
        )}

        <div className="footnote">
          <span>
            데이터: 수집 {records.length}경기 · 리메이크/비대상 큐 제외 · 시즌 시작{' '}
            {new Date(SEASON_START).toLocaleDateString('ko-KR')}
          </span>
          <span className="legend">
            <i style={{ background: 'var(--win)' }} /> 승
            <i style={{ background: 'var(--loss)', marginLeft: 8 }} /> 패
          </span>
        </div>
      </main>

      {openStat ? (
        <ChampionModal
          stat={openStat}
          meta={CHAMPION_BY_ID.get(openStat.championId)}
          accounts={accounts}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {manager === 'accounts' ? (
        <AccountManager
          accounts={accounts}
          gameCounts={gameCounts}
          busy={Boolean(progress)}
          onAdd={addAccount}
          onRemove={removeAccount}
          onClose={() => setManager(null)}
        />
      ) : null}

      {manager === 'champions' ? (
        <ChampionPicker
          championIds={championIds}
          onToggle={toggleChampion}
          onRemove={removeChampion}
          onClose={() => setManager(null)}
        />
      ) : null}
    </>
  );
}
