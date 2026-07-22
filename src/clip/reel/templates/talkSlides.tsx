// Finishes for words: a numbered takeaways stack, a 3D flip flashcard, a chat excerpt, and a spotlight
// pull-quote. These carry the "voice" of a turn, so they lean on type rather than data viz.
import type { CSSProperties } from 'react';
import type { SlideProps } from './types';
import { Card } from './primitives';
import { fitText, TITLE_TIERS, QUOTE_TIERS, BODY_TIERS } from './fitText';

const dim: CSSProperties = { color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)' };

export function TakeawaysSlide({ slots }: SlideProps<'list'>) {
  return (
    <Card kicker={`${slots.items.length} ${slots.items.length === 1 ? 'takeaway' : 'takeaways'}`}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 2.6)',
          marginTop: 'calc(var(--ru) * 2.4)',
        }}
      >
        {slots.items.map((t, i) => {
          // Items are supporting statements beside the dominant numeral, so they take the body
          // ramp — the big-index/small-text hierarchy holds at any item length.
          const f = fitText(t, BODY_TIERS);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 'calc(var(--rw) * 3)',
                alignItems: 'baseline',
                animation: `reel-rise 0.6s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.12}s both`,
              }}
            >
              <span
                style={{
                  font: '700 calc(var(--ru) * 6)/0.9 var(--reel-sans)',
                  color: 'var(--reel-accent)',
                }}
              >
                {i + 1}
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
                {t}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function FlashcardSlide({ slots }: SlideProps<'qa'>) {
  // The flip stage is a fixed-height box (reel.css) so the 3D turn always has a stable face — the
  // text re-sets by length instead, so both sides fit the same frame.
  const q = fitText(slots.question, TITLE_TIERS);
  const a = fitText(slots.answer, BODY_TIERS);
  return (
    <Card kicker="Q → A">
      <div style={{ perspective: '1100px', marginTop: 'calc(var(--ru) * 2.4)' }}>
        <div className="reel-flipcard">
          <div className="reel-flipface">
            <span className="reel-flipkick">Question</span>
            <span data-fit-tier={q.tier} style={q.style}>
              {slots.question}
            </span>
          </div>
          <div className="reel-flipface reel-flipback">
            <span className="reel-flipkick">Answer</span>
            <span data-fit-tier={a.tier} style={a.style}>
              {slots.answer}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ChatTranscriptSlide({ slots }: SlideProps<'chat'>) {
  return (
    <Card kicker="Conversation">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 1.8)',
          marginTop: 'calc(var(--ru) * 2.4)',
        }}
      >
        {slots.messages.map((m, i) => {
          const mine = m.role === 'user';
          // Each bubble re-sets by its own message length, so a long turn wraps inside its 82%
          // width instead of stretching the exchange past the card.
          const f = fitText(m.text, BODY_TIERS, 66);
          return (
            <div
              key={i}
              data-fit-tier={f.tier}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                padding: 'calc(var(--ru) * 2) calc(var(--rw) * 3.2)',
                borderRadius: 'calc(var(--ru) * 3)',
                borderBottomRightRadius: mine ? 'calc(var(--ru) * 0.6)' : 'calc(var(--ru) * 3)',
                borderBottomLeftRadius: mine ? 'calc(var(--ru) * 3)' : 'calc(var(--ru) * 0.6)',
                background: mine
                  ? 'var(--reel-accent)'
                  : 'color-mix(in oklab, var(--reel-ink) 9%, transparent)',
                color: mine ? '#fff' : 'var(--reel-ink)',
                fontWeight: 500,
                fontFamily: 'var(--reel-sans)',
                animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.18}s both`,
                ...f.style,
              }}
            >
              {m.text}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function SpotlightQuoteSlide({ slots }: SlideProps<'quote'>) {
  const { quote, highlight } = slots;
  const parts =
    highlight && quote.includes(highlight) ? quote.split(highlight) : ([quote] as string[]);
  // The class keeps the pull-quote's face; the tier overrides its flat size so a full-length
  // quote re-sets across more, tighter lines instead of towering.
  const body = fitText(quote, QUOTE_TIERS);
  return (
    <div className="reel-quote reel-fade">
      <div className="reel-quote-mark" aria-hidden="true">
        “
      </div>
      <p className="reel-quote-body" data-fit-tier={body.tier} style={body.style}>
        {parts.length === 2 ? (
          <>
            {parts[0]}
            <mark>{highlight}</mark>
            {parts[1]}
          </>
        ) : (
          quote
        )}
      </p>
      {slots.attribution && (
        <div
          style={{
            font: '500 calc(var(--ru) * 2.6)/1.3 var(--reel-mono)',
            letterSpacing: '0.06em',
            ...dim,
          }}
        >
          {slots.attribution}
        </div>
      )}
    </div>
  );
}
