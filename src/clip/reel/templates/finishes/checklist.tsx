// Steps as a checklist: done items checked off and struck through, the active one ringed and bright,
// upcoming ones an empty box — progress you can feel, in a clean card.
import type { SlideProps } from '../types';

export function ChecklistSlide({ slots }: SlideProps<'steps'>) {
  const stops = slots.stops.slice(0, 5);
  return (
    <div
      className="reel-fade"
      style={{
        width: 'calc(var(--rw) * 84)',
        maxWidth: '92%',
        padding: 'calc(var(--ru) * 4) calc(var(--rw) * 4.4)',
        borderRadius: 'calc(var(--ru) * 4)',
        background: 'color-mix(in oklab, #fff 88%, var(--reel-accent) 5%)',
        border: '1px solid color-mix(in oklab, var(--reel-ink) 12%, transparent)',
        boxShadow:
          '0 calc(var(--ru) * 6) calc(var(--ru) * 14) calc(var(--ru) * -6) rgba(20,16,44,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--ru) * 2.6)',
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
              gap: 'calc(var(--rw) * 3)',
              animation: `reel-rise 0.45s ease-out ${i * 0.1}s both`,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 'calc(var(--ru) * 3.6)',
                height: 'calc(var(--ru) * 3.6)',
                borderRadius: 'calc(var(--ru) * 1.1)',
                display: 'grid',
                placeItems: 'center',
                boxSizing: 'border-box',
                background: done
                  ? 'var(--reel-accent)'
                  : active
                    ? 'color-mix(in oklab, var(--reel-accent) 18%, transparent)'
                    : 'transparent',
                border: `calc(var(--ru) * 0.5) solid ${done || active ? 'var(--reel-accent)' : 'color-mix(in oklab, var(--reel-ink) 22%, transparent)'}`,
                color: '#fff',
                font: '700 calc(var(--ru) * 2.4)/1 var(--reel-sans)',
              }}
            >
              {done ? '✓' : ''}
            </span>
            <span
              style={{
                font: `${active ? 700 : 600} calc(var(--ru) * 3.2)/1.25 var(--reel-sans)`,
                color: done
                  ? 'color-mix(in oklab, var(--reel-ink) 50%, transparent)'
                  : 'var(--reel-ink)',
                textDecoration: done ? 'line-through' : 'none',
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
