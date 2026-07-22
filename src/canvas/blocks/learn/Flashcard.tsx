import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { FlashcardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FlashcardProps & { delay?: number };

export function Flashcard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  cards,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];

  const go = (d: number) => {
    setIdx((i) => Math.max(0, Math.min(cards.length - 1, i + d)));
    setFlipped(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFlipped((f) => !f);
    }
  };

  if (!card) return null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <button
        className={'lr-fc' + (flipped ? ' flipped' : '')}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={onKey}
        aria-label={
          flipped ? 'Showing answer — click to flip back' : 'Showing prompt — click to reveal'
        }
      >
        <div className="lr-fc-inner">
          <div className="lr-fc-face lr-fc-front">
            {card.tag && <span className="lr-fc-tag">{card.tag}</span>}
            <span className="lr-fc-text" dangerouslySetInnerHTML={richInnerHtml(card.front)} />
            <span className="lr-fc-hint">Click to flip</span>
          </div>
          <div className="lr-fc-face lr-fc-back">
            <span className="lr-fc-text" dangerouslySetInnerHTML={richInnerHtml(card.back)} />
          </div>
        </div>
      </button>

      <div className="lr-fc-nav">
        <button
          className="mini-btn lr-fc-prev"
          onClick={() => go(-1)}
          disabled={idx === 0}
          aria-label="Previous"
        >
          <Icon.chevR />
        </button>
        <span className="lr-fc-count tab-num">
          {idx + 1} / {cards.length}
        </span>
        <button
          className="mini-btn"
          onClick={() => go(1)}
          disabled={idx === cards.length - 1}
          aria-label="Next"
        >
          <Icon.chevR />
        </button>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
