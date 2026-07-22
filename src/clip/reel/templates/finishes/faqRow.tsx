// A Q&A as an opened FAQ row: the question as a header with a turned + (an opened accordion), the
// answer revealed beneath it.
import type { SlideProps } from '../types';
import { fitText, stackedMinHeight, TITLE_TIERS, BODY_TIERS } from '../fitText';

export function FaqRowSlide({ slots }: SlideProps<'qa'>) {
  // Header and body re-set to their own lengths so a long question or answer wraps tighter
  // instead of ballooning the row.
  const q = fitText(slots.question, TITLE_TIERS);
  const a = fitText(slots.answer, BODY_TIERS);
  return (
    <div
      className="reel-fade"
      style={{
        width: 'calc(var(--rw) * 86)',
        maxWidth: '92%',
        borderRadius: 'calc(var(--ru) * 3.2)',
        overflow: 'hidden',
        border: '1px solid color-mix(in oklab, var(--reel-ink) 12%, transparent)',
        background: 'color-mix(in oklab, #fff 82%, transparent)',
        boxShadow:
          '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -6) rgba(20,16,44,0.4)',
        // Both rows below stack a clamped block inside a 6.4ru-vertical-padding row; give THIS
        // card (not the clamped children — see stackedMinHeight) an explicit floor for both
        // combined, so its own overflow:hidden never clips the last line before the row runs out
        // of a card tall enough to hold it.
        ...stackedMinHeight(
          { ladder: TITLE_TIERS, tier: q.tier, padRu: 6.4 },
          { ladder: BODY_TIERS, tier: a.tier, padRu: 6.4 },
        ),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--rw) * 3)',
          padding: 'calc(var(--ru) * 3.2) calc(var(--rw) * 4)',
          background: 'color-mix(in oklab, var(--reel-accent) 12%, transparent)',
        }}
      >
        <span
          data-fit-tier={q.tier}
          style={{
            flex: 1,
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            color: 'var(--reel-ink)',
            minWidth: 0,
            ...q.style,
          }}
        >
          {slots.question}
        </span>
        <span
          style={{
            flexShrink: 0,
            font: '300 calc(var(--ru) * 5)/1 var(--reel-sans)',
            color: 'var(--reel-accent)',
            transform: 'rotate(45deg)',
          }}
        >
          +
        </span>
      </div>
      <div
        data-fit-tier={a.tier}
        style={{
          padding: 'calc(var(--ru) * 3.2) calc(var(--rw) * 4)',
          fontWeight: 500,
          fontFamily: 'var(--reel-sans)',
          color: 'color-mix(in oklab, var(--reel-ink) 78%, transparent)',
          animation: 'reel-rise 0.5s ease-out 0.2s both',
          ...a.style,
        }}
      >
        {slots.answer}
      </div>
    </div>
  );
}
