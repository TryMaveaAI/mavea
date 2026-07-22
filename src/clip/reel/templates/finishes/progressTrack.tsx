// Steps as a lit progress track: a vertical rail fills up to the active stop, each milestone a
// glowing node (done behind it, upcoming ahead) — on the dark wash. Dots are in-flow so labels
// always clear them; the rail sits behind.
import type { SlideProps } from '../types';

export function ProgressTrackSlide({ slots }: SlideProps<'steps'>) {
  const stops = slots.stops.slice(0, 5);
  const found = stops.findIndex((s) => s.state === 'active');
  const activeIdx = found < 0 ? 0 : found;
  const fillPct = stops.length > 1 ? (activeIdx / (stops.length - 1)) * 100 : 0;
  return (
    <div
      className="reel-fade"
      style={{ width: 'calc(var(--rw) * 82)', maxWidth: '92%', position: 'relative' }}
    >
      <style>{`@keyframes ptk-fill{from{transform:scaleY(0)}to{transform:scaleY(1)}}`}</style>
      <span
        style={{
          position: 'absolute',
          left: 'calc(var(--ru) * 1.4)',
          top: 'calc(var(--ru) * 1.8)',
          bottom: 'calc(var(--ru) * 1.8)',
          width: 'calc(var(--ru) * 0.6)',
          transform: 'translateX(-50%)',
          borderRadius: 999,
          background: 'color-mix(in oklab, var(--reel-ink) 20%, transparent)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 'calc(var(--ru) * 1.4)',
          top: 'calc(var(--ru) * 1.8)',
          height: `${fillPct}%`,
          width: 'calc(var(--ru) * 0.6)',
          transform: 'translateX(-50%)',
          transformOrigin: 'top',
          borderRadius: 999,
          background: 'linear-gradient(var(--reel-accent), var(--reel-accent-2))',
          animation: 'ptk-fill 0.9s cubic-bezier(0.3,0.7,0.3,1) 0.2s both',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--ru) * 3.2)' }}>
        {stops.map((s, i) => {
          const done = i < activeIdx || s.state === 'done';
          const active = i === activeIdx && s.state === 'active';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(var(--rw) * 3.4)',
                animation: `reel-rise 0.5s ease-out ${i * 0.12}s both`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: active ? 'calc(var(--ru) * 3.2)' : 'calc(var(--ru) * 2.6)',
                  height: active ? 'calc(var(--ru) * 3.2)' : 'calc(var(--ru) * 2.6)',
                  marginLeft: active ? 'calc(var(--ru) * -0.3)' : 0,
                  borderRadius: '50%',
                  background: done || active ? 'var(--reel-accent)' : 'var(--reel-bg)',
                  border: 'calc(var(--ru) * 0.5) solid var(--reel-accent)',
                  boxSizing: 'border-box',
                  boxShadow: active ? '0 0 calc(var(--ru) * 3) var(--reel-glow)' : 'none',
                }}
              />
              <span
                style={{
                  font: `${active ? 700 : 600} calc(var(--ru) * 3.1)/1.25 var(--reel-sans)`,
                  color: done
                    ? 'color-mix(in oklab, var(--reel-ink) 55%, transparent)'
                    : 'var(--reel-ink)',
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
    </div>
  );
}
