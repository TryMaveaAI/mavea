// A conceptmap as a branch diagram: the center idea anchored on the left, each connected idea
// branching to the right off a short connector — a clean, readable mind-map.
import type { SlideProps } from '../types';

export function BranchTreeSlide({ slots }: SlideProps<'conceptmap'>) {
  const nodes = slots.nodes.slice(0, 5);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--rw) * 4)',
        width: 'calc(var(--rw) * 92)',
        maxWidth: '94%',
      }}
    >
      <div
        className="reel-fade"
        style={{
          flexShrink: 0,
          maxWidth: 'calc(var(--rw) * 34)',
          padding: 'calc(var(--ru) * 2.6) calc(var(--rw) * 3.4)',
          borderRadius: 'calc(var(--ru) * 3)',
          background: 'var(--reel-accent)',
          color: '#fff',
          font: '700 calc(var(--ru) * 4)/1.1 var(--reel-sans)',
          letterSpacing: '-0.01em',
          // The pill is width-capped so the branches keep their room — a long unbroken center
          // (it can run to 16 chars) wraps inside it rather than spilling past the radius.
          overflowWrap: 'anywhere',
        }}
      >
        {slots.center}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 1.8)',
          minWidth: 0,
        }}
      >
        {nodes.map((n, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--rw) * 2)',
              animation: `reel-rise 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.1}s both`,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 'calc(var(--rw) * 4)',
                height: 'calc(var(--ru) * 0.5)',
                borderRadius: 999,
                background: 'color-mix(in oklab, var(--reel-accent) 45%, transparent)',
              }}
            />
            <span
              style={{
                padding: 'calc(var(--ru) * 1.4) calc(var(--rw) * 2.8)',
                borderRadius: 999,
                background: 'color-mix(in oklab, var(--reel-ink) 6%, transparent)',
                border: '1px solid color-mix(in oklab, var(--reel-ink) 12%, transparent)',
                font: '600 calc(var(--ru) * 2.8)/1.2 var(--reel-sans)',
                color: 'var(--reel-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {n.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
