// A Q&A as a clean exam card: the question block over a hairline rule over the answer, each tagged
// with a round mono Q / A marker.
import type { SlideProps } from '../types';
import { fitText, TITLE_TIERS, BODY_TIERS, type Ladder } from '../fitText';

function Row({
  tag,
  tone,
  text,
  ladder,
}: {
  tag: string;
  tone: string;
  text: string;
  ladder: Ladder;
}) {
  // Each row re-sets to its own length: a short question stays exam-bold, a long answer wraps
  // smaller instead of stretching the card.
  const f = fitText(text, ladder);
  return (
    <div style={{ display: 'flex', gap: 'calc(var(--rw) * 3)', alignItems: 'flex-start' }}>
      <span
        style={{
          flexShrink: 0,
          width: 'calc(var(--ru) * 4.4)',
          height: 'calc(var(--ru) * 4.4)',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: tone,
          color: '#fff',
          font: '700 calc(var(--ru) * 2.4)/1 var(--reel-mono)',
        }}
      >
        {tag}
      </span>
      <span
        data-fit-tier={f.tier}
        style={{
          fontWeight: 600,
          fontFamily: 'var(--reel-sans)',
          color: 'var(--reel-ink)',
          minWidth: 0,
          ...f.style,
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function QuizCardSlide({ slots }: SlideProps<'qa'>) {
  return (
    <div
      className="reel-fade"
      style={{
        width: 'calc(var(--rw) * 84)',
        maxWidth: '92%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 3)',
        padding: 'calc(var(--ru) * 4.4) calc(var(--rw) * 5)',
        borderRadius: 'calc(var(--ru) * 4)',
        background: 'color-mix(in oklab, #fff 88%, var(--reel-accent) 6%)',
        border: '1px solid color-mix(in oklab, var(--reel-ink) 12%, transparent)',
        boxShadow:
          '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -6) rgba(20,16,44,0.4)',
      }}
    >
      <Row tag="Q" tone="var(--reel-accent)" text={slots.question} ladder={TITLE_TIERS} />
      <span
        style={{ height: 1, background: 'color-mix(in oklab, var(--reel-ink) 14%, transparent)' }}
      />
      <Row tag="A" tone="var(--reel-accent-2)" text={slots.answer} ladder={BODY_TIERS} />
    </div>
  );
}
