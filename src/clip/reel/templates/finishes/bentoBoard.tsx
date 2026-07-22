// A "metrics" finish as an asymmetric bento grid: the top metric gets a large hero tile with the
// shared Ring donut, the rest fall into smaller frosted tiles beside it (CSS Grid's dense
// auto-placement handles 1-3 remaining tiles without per-count branching), and any trailing "next"
// line runs as a footer strip across the bottom.
import type { CSSProperties } from 'react';
import type { SlideProps } from '../types';
import { Ring } from '../primitives';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

const SERIES = [
  'var(--reel-accent)',
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-orb-2)',
];

// The small tiles run a value at roughly a third of the hero's scale, so a long percentage steps
// down the same ladder instead of overrunning its tile.
const TILE_VALUE_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (6 / 16) }));

const tile = (delay: number): CSSProperties => ({
  position: 'relative',
  borderRadius: 'calc(var(--ru) * 3.2)',
  padding: 'calc(var(--ru) * 2.4) calc(var(--rw) * 2.8)',
  background: 'color-mix(in oklab, #fff 70%, var(--reel-accent) 6%)',
  border: '1px solid color-mix(in oklab, var(--reel-ink) 10%, transparent)',
  boxShadow: '0 calc(var(--ru) * 3) calc(var(--ru) * 8) calc(var(--ru) * -5) rgba(20, 16, 44, 0.3)',
  backdropFilter: 'blur(6px)',
  animation: `reel-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) ${delay}s both`,
});

export function BentoBoardSlide({ slots }: SlideProps<'metrics'>) {
  const [hero, ...rest] = slots.items;
  return (
    <div className="reel-fade" style={{ width: 'calc(var(--rw) * 84)', maxWidth: '92%' }}>
      <div
        style={{
          textAlign: 'center',
          font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'color-mix(in oklab, var(--reel-ink) 55%, transparent)',
          marginBottom: 'calc(var(--ru) * 2.4)',
        }}
      >
        The breakdown
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridAutoRows: 'calc(var(--ru) * 15)',
          gridAutoFlow: 'dense',
          gap: 'calc(var(--ru) * 2.2)',
        }}
      >
        {hero && (
          <div style={{ ...tile(0), gridColumn: 'span 2', gridRow: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--rw) * 2.4)' }}>
              <Ring pct={hero.pct} color={SERIES[0]} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    font: '700 calc(var(--ru) * 5.2)/1 var(--reel-sans)',
                    color: SERIES[0],
                  }}
                >
                  {hero.pct}%
                </div>
                <div
                  style={{
                    font: '600 calc(var(--ru) * 2.9)/1.2 var(--reel-sans)',
                    color: 'var(--reel-ink)',
                    marginTop: 'calc(var(--ru) * 0.8)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hero.label}
                </div>
              </div>
            </div>
          </div>
        )}

        {rest.map((it, i) => {
          const value = fitLine(`${it.pct}%`, TILE_VALUE_TIERS);
          const color = SERIES[(i + 1) % SERIES.length];
          return (
            <div key={i} style={tile(0.14 + i * 0.1)}>
              <div
                data-fit-tier={value.tier}
                style={{ fontWeight: 700, fontFamily: 'var(--reel-sans)', color, ...value.style }}
              >
                {it.pct}%
              </div>
              <div
                style={{
                  font: '500 calc(var(--ru) * 2.2)/1.25 var(--reel-mono)',
                  color: 'color-mix(in oklab, var(--reel-ink) 62%, transparent)',
                  marginTop: 'calc(var(--ru) * 0.8)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.label}
              </div>
            </div>
          );
        })}
      </div>

      {slots.next && (
        <div
          style={{
            marginTop: 'calc(var(--ru) * 2.2)',
            borderRadius: 'calc(var(--ru) * 2.4)',
            padding: 'calc(var(--ru) * 1.8) calc(var(--rw) * 3.2)',
            background: 'color-mix(in oklab, var(--reel-accent) 10%, transparent)',
            font: '500 calc(var(--ru) * 2.4)/1.3 var(--reel-sans)',
            color: 'var(--reel-ink)',
            animation: 'reel-fade-up 0.5s cubic-bezier(0.2,0.7,0.3,1) 0.4s both',
          }}
        >
          {slots.next}
        </div>
      )}
    </div>
  );
}
