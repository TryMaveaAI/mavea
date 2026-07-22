// A Q&A as a dramatic reveal: the question sits quiet up top, then the answer lands big and lit
// below it — the "aha" beat, on the dark wash.
import type { SlideProps } from '../types';
import { fitText, QUOTE_TIERS, BODY_TIERS } from '../fitText';

export function RevealCardSlide({ slots }: SlideProps<'qa'>) {
  // The question is the quiet setup, so it takes the supporting ramp; the answer is the beat itself
  // and rides the display quote ramp — big while it's short, stepping down only as it lengthens.
  const q = fitText(slots.question, BODY_TIERS);
  const a = fitText(slots.answer, QUOTE_TIERS);
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 88)',
        maxWidth: '94%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'calc(var(--ru) * 3.6)',
        textAlign: 'center',
      }}
    >
      <div
        className="reel-fade"
        data-fit-tier={q.tier}
        style={{
          fontWeight: 600,
          fontFamily: 'var(--reel-sans)',
          color: 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
          ...q.style,
        }}
      >
        {slots.question}
      </div>
      <span
        style={{
          width: 'calc(var(--rw) * 8)',
          height: 'calc(var(--ru) * 0.5)',
          borderRadius: 999,
          background: 'var(--reel-accent)',
        }}
      />
      <div
        data-fit-tier={a.tier}
        style={{
          fontWeight: 700,
          fontFamily: 'var(--reel-sans)',
          letterSpacing: '-0.01em',
          color: 'var(--reel-ink)',
          textShadow: '0 0 calc(var(--ru) * 5) var(--reel-glow)',
          animation: 'reel-rise 0.6s cubic-bezier(0.2,0.7,0.3,1) 0.25s both',
          ...a.style,
        }}
      >
        {slots.answer}
      </div>
    </div>
  );
}
