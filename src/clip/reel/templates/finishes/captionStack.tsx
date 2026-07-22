// A chat as a captioned exchange: each line lands centered like a spoken subtitle, tagged by who
// said it — the conversation as a kinetic transcript on the dark wash.
import type { SlideProps } from '../types';
import { fitText, BODY_TIERS } from '../fitText';

export function CaptionStackSlide({ slots }: SlideProps<'chat'>) {
  const msgs = slots.messages.slice(0, 4);
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 90)',
        maxWidth: '94%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 3)',
        textAlign: 'center',
        alignItems: 'center',
      }}
    >
      {msgs.map((m, i) => {
        const mine = m.role === 'user';
        // Each caption re-sets to its line's length, the way subtitles shrink for a long sentence.
        const f = fitText(m.text, BODY_TIERS, 66);
        return (
          <div
            key={i}
            style={{ animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.18}s both` }}
          >
            <div
              style={{
                font: '700 calc(var(--ru) * 1.9)/1 var(--reel-mono)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: mine ? 'var(--reel-accent-2)' : 'var(--reel-accent)',
                marginBottom: 'calc(var(--ru) * 1)',
              }}
            >
              {mine ? 'You' : 'Mavéa'}
            </div>
            <div
              data-fit-tier={f.tier}
              style={{
                fontWeight: mine ? 500 : 700,
                fontFamily: 'var(--reel-sans)',
                color: 'var(--reel-ink)',
                ...f.style,
              }}
            >
              {m.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
