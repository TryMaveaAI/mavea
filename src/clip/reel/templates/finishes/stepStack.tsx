// Steps as a numbered stack: each milestone a rounded tile with its number (done = check), the
// current one lifted and accented — a clean, ordered path.
import type { SlideProps } from '../types';

export function StepStackSlide({ slots }: SlideProps<'steps'>) {
  const stops = slots.stops.slice(0, 5);
  return (
    <div
      className="reel-fade"
      style={{
        width: 'calc(var(--rw) * 86)',
        maxWidth: '92%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 1.8)',
      }}
    >
      {stops.map((s, i) => {
        const done = s.state === 'done';
        const active = s.state === 'active';
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--rw) * 3.2)',
              padding: 'calc(var(--ru) * 2.4) calc(var(--rw) * 3.4)',
              borderRadius: 'calc(var(--ru) * 2.6)',
              background: active
                ? 'var(--reel-accent)'
                : 'color-mix(in oklab, var(--reel-ink) 6%, #fff)',
              border: `1px solid color-mix(in oklab, var(--reel-ink) ${active ? 0 : 10}%, transparent)`,
              boxShadow: active
                ? '0 calc(var(--ru) * 4) calc(var(--ru) * 10) calc(var(--ru) * -4) var(--reel-glow)'
                : 'none',
              animation: `reel-rise 0.45s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.1}s both`,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 'calc(var(--ru) * 4.6)',
                height: 'calc(var(--ru) * 4.6)',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                font: '700 calc(var(--ru) * 2.8)/1 var(--reel-mono)',
                background: active
                  ? 'rgba(255,255,255,0.22)'
                  : 'color-mix(in oklab, var(--reel-accent) 16%, transparent)',
                color: active ? '#fff' : 'var(--reel-accent)',
              }}
            >
              {done ? '✓' : i + 1}
            </span>
            <span
              style={{
                font: '600 calc(var(--ru) * 3.1)/1.25 var(--reel-sans)',
                color: active ? '#fff' : 'var(--reel-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
