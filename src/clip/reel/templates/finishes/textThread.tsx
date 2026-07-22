// A chat as a phone text thread: the user's lines as accent bubbles on the right, Mavéa's as soft
// bubbles on the left, each with a little tail — bigger and warmer than the canonical transcript.
import type { SlideProps } from '../types';
import { fitText, BODY_TIERS } from '../fitText';

export function TextThreadSlide({ slots }: SlideProps<'chat'>) {
  const msgs = slots.messages.slice(0, 4);
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 86)',
        maxWidth: '92%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 1.8)',
      }}
    >
      {msgs.map((m, i) => {
        const mine = m.role === 'user';
        // Each bubble re-sets to its own message length so a long turn wraps inside the bubble
        // instead of pushing the thread past the frame.
        const f = fitText(m.text, BODY_TIERS, 62);
        return (
          <div
            key={i}
            data-fit-tier={f.tier}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '84%',
              padding: 'calc(var(--ru) * 2.2) calc(var(--rw) * 3.4)',
              borderRadius: 'calc(var(--ru) * 3.4)',
              borderBottomRightRadius: mine ? 'calc(var(--ru) * 0.8)' : undefined,
              borderBottomLeftRadius: mine ? undefined : 'calc(var(--ru) * 0.8)',
              background: mine
                ? 'var(--reel-accent)'
                : 'color-mix(in oklab, var(--reel-ink) 10%, #fff)',
              color: mine ? '#fff' : 'var(--reel-ink)',
              fontWeight: 500,
              fontFamily: 'var(--reel-sans)',
              boxShadow:
                '0 calc(var(--ru) * 1.5) calc(var(--ru) * 4) calc(var(--ru) * -2) rgba(20,16,44,0.25)',
              animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.16}s both`,
              ...f.style,
            }}
          >
            {m.text}
          </div>
        );
      })}
    </div>
  );
}
