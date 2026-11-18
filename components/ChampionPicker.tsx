'use client';

import { useEffect, useState } from 'react';
import { CHAMPION_BY_ID, CHAMPIONS, portraitUrl } from '@/lib/champions';
import { LANES } from '@/lib/meta';
import type { Lane } from '@/lib/types';
import { MAX_CHAMPIONS } from '@/lib/useCollection';

type Props = {
  championIds: number[];
  onToggle: (championId: number) => void;
  onRemove: (championId: number) => void;
  onClose: () => void;
};

export default function ChampionPicker({ championIds, onToggle, onRemove, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [lane, setLane] = useState<Lane | 'all'>('all');

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

  const q = query.trim().toLowerCase();
  const list = CHAMPIONS.filter((c) => {
    if (lane !== 'all' && !c.lanes.includes(lane)) return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.alias.toLowerCase().includes(q);
  });

  const selected = new Set(championIds);
  const full = championIds.length >= MAX_CHAMPIONS;

  return (
    <div className="backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-label="연습 챔피언 선택"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title">
            <h3>연습 챔피언</h3>
            <p>
              최대 {MAX_CHAMPIONS}개 · 선택 {championIds.length}개
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="manager-body">
          <div className="slots" aria-label="선택된 챔피언">
            {championIds.length === 0 ? (
              <span className="slots-empty">아직 선택한 챔피언이 없습니다.</span>
            ) : (
              championIds.map((id) => {
                const meta = CHAMPION_BY_ID.get(id);
                if (!meta) return null;
                return (
                  <span key={id} className="slot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={portraitUrl(meta.alias)} alt="" width={22} height={22} />
                    <span>{meta.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(id)}
                      aria-label={`${meta.name} 선택 해제`}
                    >
                      ✕
                    </button>
                  </span>
                );
              })
            )}
          </div>

          <div className="picker-tools">
            <input
              className="input"
              type="search"
              placeholder="챔피언 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="챔피언 검색"
            />
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
          </div>

          {full ? (
            <p className="form-note">
              {MAX_CHAMPIONS}개를 모두 선택했습니다. 다른 챔피언을 고르려면 위에서 해제하세요.
            </p>
          ) : null}

          {list.length === 0 ? (
            <div className="empty">
              <strong>검색 결과가 없습니다</strong>
              다른 이름이나 포지션으로 찾아보세요.
            </div>
          ) : (
            <div className="pick-grid">
              {list.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="pick"
                    aria-pressed={isSelected}
                    disabled={!isSelected && full}
                    onClick={() => onToggle(c.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={portraitUrl(c.alias)} alt="" loading="lazy" width={30} height={30} />
                    <span className="pick-name">{c.name}</span>
                    <span className="pick-check" aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
