'use client';

import type { SyncProgress } from '@/lib/sync';
import type { CollectionError } from '@/lib/useCollection';

export function SyncProgressPanel({
  progress,
  onCancel,
}: {
  progress: SyncProgress;
  onCancel: () => void;
}) {
  const { phase, accountIndex, accountTotal, accountLabel, matchDone, matchTotal, added } = progress;
  const ratio = matchTotal ? matchDone / matchTotal : 0.08;
  const percent = Math.round(Math.min(ratio, 1) * 100);

  return (
    <div className="sync-panel" role="status" aria-live="polite">
      <div className="sync-head">
        <span>
          {phase === 'ids' ? '경기 목록 조회 중' : '경기 상세 수집 중'}
          {accountLabel ? <b> · {accountLabel}</b> : null}
        </span>
        <span>
          {accountIndex}/{accountTotal} 계정
        </span>
      </div>
      <div className="sync-bar">
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="sync-sub">
        <span>
          {matchTotal ? `${matchDone}/${matchTotal} 경기 · 신규 ${added}건` : '계정 전적을 확인하는 중…'}
        </span>
        <button type="button" className="link-btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}

const TITLES: Record<string, string> = {
  INVALID_KEY: 'API 키 오류',
  RATE_LIMIT: 'Riot API 호출 한도 초과',
  PARTIAL: '일부 계정 수집 실패',
  NETWORK: '네트워크 오류',
  STALE_PUUID: '계정 재연결 필요',
};

export function SyncErrorAlert({
  error,
  onDismiss,
}: {
  error: CollectionError;
  onDismiss: () => void;
}) {
  const title = TITLES[error.code] ?? '수집 실패';
  const hint =
    error.code === 'INVALID_KEY'
      ? ' .env 의 RIOT_API_KEY 를 갱신한 뒤 다시 시도하세요. (개발용 키는 24시간마다 만료됩니다)'
      : error.code === 'RATE_LIMIT'
        ? ' 1~2분 뒤에 다시 시도해 주세요.'
        : '';

  return (
    <div className="alert" role="alert">
      <div style={{ flex: 1 }}>
        <strong>{title}</strong>
        <div>
          {error.message}
          {hint}
        </div>
      </div>
      <button type="button" className="link-btn" onClick={onDismiss}>
        닫기
      </button>
    </div>
  );
}
