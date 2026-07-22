// A "chat" finish as a voice-notes thread: each turn is a bubble carrying a static waveform (bar
// heights derived from a deterministic hash of the message text, so the same message always draws
// the same waveform — never Math.random, matching the codebase's deterministic-fallback habit) and
// a duration chip estimated from the text length, with the real message printed as a caption below.
// The waveform and duration are decorative chrome around REAL text, same as the ticker's "LIVE" tag
// or the Finder sidebar's stock favorites — nothing here asserts a fact that wasn't actually said.
import type { SlideProps } from '../types';
import { fitText, BODY_TIERS } from '../fitText';

const BAR_COUNT = 22;

/** A tiny deterministic PRNG seeded from the message text (djb2-ish, then an LCG step per bar), so
 *  the waveform is stable and reproducible per message instead of drawn fresh (and differently)
 *  every render — the readable amplitude curve runs 18-100% of the bubble's waveform height. */
function amplitudes(text: string, count: number): number[] {
  let seed = 5381;
  for (let i = 0; i < text.length; i++) seed = ((seed << 5) + seed + text.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out.push(18 + (((seed >>> 8) % 1000) / 1000) * 82);
  }
  return out;
}

function estDuration(text: string): string {
  // A generous reading pace (~14 chars/sec) — decorative, not a claim about a real recording.
  const secs = Math.max(2, Math.round(text.length / 14));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceMemoSlide({ slots }: SlideProps<'chat'>) {
  const msgs = slots.messages.slice(0, 4);
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 86)',
        maxWidth: '92%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 2.4)',
      }}
    >
      {msgs.map((m, i) => {
        const mine = m.role === 'user';
        const amp = amplitudes(m.text || 'mavea', BAR_COUNT);
        const color = mine ? '#fff' : 'var(--reel-accent)';
        const caption = fitText(m.text, BODY_TIERS, 60);
        return (
          <div
            key={i}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '86%',
              display: 'flex',
              flexDirection: 'column',
              gap: 'calc(var(--ru) * 1)',
              animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.16}s both`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(var(--rw) * 2)',
                padding: 'calc(var(--ru) * 2) calc(var(--rw) * 3)',
                borderRadius: 'calc(var(--ru) * 3.4)',
                borderBottomRightRadius: mine ? 'calc(var(--ru) * 0.8)' : undefined,
                borderBottomLeftRadius: mine ? undefined : 'calc(var(--ru) * 0.8)',
                background: mine
                  ? 'var(--reel-accent)'
                  : 'color-mix(in oklab, var(--reel-ink) 10%, #fff)',
                boxShadow:
                  '0 calc(var(--ru) * 1.5) calc(var(--ru) * 4) calc(var(--ru) * -2) rgba(20,16,44,0.25)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 'calc(var(--ru) * 3.6)',
                  height: 'calc(var(--ru) * 3.6)',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: mine
                    ? 'rgba(255,255,255,0.24)'
                    : 'color-mix(in oklab, var(--reel-accent) 16%, transparent)',
                  color,
                  fontSize: 'calc(var(--ru) * 1.8)',
                }}
              >
                ▶
              </span>
              <svg
                viewBox={`0 0 ${BAR_COUNT * 3} 24`}
                preserveAspectRatio="none"
                style={{ width: 'calc(var(--rw) * 32)', height: 'calc(var(--ru) * 3.6)' }}
                aria-hidden="true"
              >
                {amp.map((h, bi) => (
                  <rect
                    key={bi}
                    x={bi * 3}
                    y={(24 - (h / 100) * 24) / 2}
                    width={1.8}
                    height={(h / 100) * 24}
                    rx={0.9}
                    fill={color}
                    opacity={mine ? 0.92 : 1}
                  />
                ))}
              </svg>
              <span
                style={{
                  flexShrink: 0,
                  font: '600 calc(var(--ru) * 1.9)/1 var(--reel-mono)',
                  color: mine
                    ? 'rgba(255,255,255,0.85)'
                    : 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
                }}
              >
                {estDuration(m.text)}
              </span>
            </div>
            {m.text && (
              <div
                data-fit-tier={caption.tier}
                style={{
                  padding: '0 calc(var(--rw) * 1)',
                  fontWeight: 500,
                  fontFamily: 'var(--reel-sans)',
                  color: 'color-mix(in oklab, var(--reel-ink) 68%, transparent)',
                  textAlign: mine ? 'right' : 'left',
                  ...caption.style,
                }}
              >
                {m.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
