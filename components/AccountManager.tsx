'use client';

import { useEffect, useState } from 'react';
import type { Account } from '@/lib/types';
import { MAX_ACCOUNTS } from '@/lib/useCollection';

type Props = {
  accounts: Account[];
  gameCounts: Record<string, number>;
  busy: boolean;
  onAdd: (gameName: string, tagLine: string) => Promise<{ ok: boolean; message?: string }>;
  onRemove: (puuid: string) => void;
  onClose: () => void;
};

export default function AccountManager({
  accounts,
  gameCounts,
  busy,
  onAdd,
  onRemove,
  onClose,
}: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmPuuid, setConfirmPuuid] = useState<string | null>(null);

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

  const full = accounts.length >= MAX_ACCOUNTS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || busy) return;

    const raw = value.trim();
    const idx = raw.lastIndexOf('#');
    if (idx <= 0 || idx === raw.length - 1) {
      setError('이름#태그 형식으로 입력해 주세요. (예: Hide on bush#KR1)');
      return;
    }

    const gameName = raw.slice(0, idx).trim();
    const tagLine = raw.slice(idx + 1).trim();

    setPending(true);
    setError(null);
    const result = await onAdd(gameName, tagLine);
    setPending(false);

    if (result.ok) {
      setValue('');
    } else {
      setError(result.message ?? '계정을 추가하지 못했습니다.');
    }
  }

  return (
    <div className="backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-label="계정 관리"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title">
            <h3>계정 관리</h3>
            <p>
              Riot ID 로 등록합니다. 최대 {MAX_ACCOUNTS}개 · 현재 {accounts.length}개
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="manager-body">
          <form className="add-form" onSubmit={submit}>
            <input
              className="input"
              placeholder="이름#태그 (예: Hide on bush#KR1)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={full || pending}
              aria-label="Riot ID"
            />
            <button type="submit" className="btn btn--gold" disabled={full || pending}>
              {pending ? '확인 중…' : '추가'}
            </button>
          </form>

          {full ? (
            <p className="form-note">계정이 가득 찼습니다. 하나를 삭제한 뒤 추가해 주세요.</p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <ul className="acc-list">
            {accounts.map((acc) => {
              const confirming = confirmPuuid === acc.puuid;
              const games = gameCounts[acc.puuid] ?? 0;

              return (
                <li key={acc.puuid} className="acc-row">
                  <span className="avatar" aria-hidden="true">
                    {acc.gameName.slice(0, 1)}
                  </span>
                  <div className="acc-row-main">
                    <div className="acc-name">
                      {acc.gameName}
                      <span className="acc-tag">#{acc.tagLine}</span>
                    </div>
                    <div className="acc-sub">
                      {acc.summonerLevel ? `Lv.${acc.summonerLevel} · ` : ''}
                      {acc.region.toUpperCase()} · 수집 {games}경기
                    </div>
                  </div>

                  {confirming ? (
                    <div className="confirm-group">
                      <span className="confirm-text">전적도 함께 삭제됩니다</span>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => {
                          onRemove(acc.puuid);
                          setConfirmPuuid(null);
                        }}
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setConfirmPuuid(null)}
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setConfirmPuuid(acc.puuid)}
                    >
                      삭제
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {accounts.length === 0 ? (
            <div className="empty" style={{ marginTop: 12 }}>
              <strong>등록된 계정이 없습니다</strong>
              위 입력창에 Riot ID 를 넣어 계정을 추가하세요.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
