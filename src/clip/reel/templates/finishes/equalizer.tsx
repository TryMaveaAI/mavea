// A "metrics" finish as a vertical audio equalizer: one column per metric, its height mapping to
// the percentage, a bright cap glow marking the peak, and a fine LED-segment texture baked into the
// fill as a static background (no extra DOM per segment — the hardware-cost knob here is COLUMNS,
// not the tiny stripes inside them). Bars rise on entrance with the shared reel-grow-bar keyframe,
// staggered per COLUMN so a four-metric turn only ever animates four elements at once.
import type { SlideProps } from '../types';
import { fitText, BODY_TIERS, type Ladder } from '../fitText';

const SERIES = [
  'var(--reel-accent)',
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-orb-2)',
];

// A column is a narrow ~11rw lane, far tighter than the standard 78rw text column — the ladder
// steps down (and wraps to two lines) accordingly instead of ellipsizing the label away.
const EQ_LABEL_TIERS: Ladder = BODY_TIERS.map((t) => ({ ...t, size: t.size * 0.5, maxLines: 2 }));
const COLUMN_MEASURE = 11;

export function EqualizerSlide({ slots }: SlideProps<'metrics'>) {
  const items = slots.items.slice(0, 4);
  return (
    <div
      className="reel-fade"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 'calc(var(--rw) * 3.6)',
        width: 'calc(var(--rw) * 84)',
        maxWidth: '92%',
      }}
    >
      {items.map((it, i) => {
        const color = SERIES[i % SERIES.length];
        const pct = Math.max(4, it.pct);
        const label = fitText(it.label, EQ_LABEL_TIERS, COLUMN_MEASURE);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'calc(var(--ru) * 1.4)',
              width: `calc(var(--rw) * ${COLUMN_MEASURE})`,
            }}
          >
            <span style={{ font: '700 calc(var(--ru) * 2.6)/1 var(--reel-mono)', color }}>
              {it.pct}%
            </span>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 'calc(var(--ru) * 44)',
                display: 'flex',
                alignItems: 'flex-end',
                borderRadius: 'calc(var(--ru) * 1.4)',
                background: 'color-mix(in oklab, var(--reel-ink) 12%, transparent)',
                overflow: 'hidden',
              }}
            >
              <i
                style={{
                  display: 'block',
                  width: '100%',
                  height: `${pct}%`,
                  transformOrigin: 'bottom',
                  borderRadius: 'inherit',
                  background: color,
                  backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 3px, transparent 3px 7px)`,
                  animation: `reel-grow-bar 0.8s cubic-bezier(0.3,0.7,0.3,1) ${i * 0.12}s both`,
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${pct}%`,
                  height: 'calc(var(--ru) * 0.5)',
                  background: color,
                  boxShadow: `0 0 calc(var(--ru) * 2.4) ${color}`,
                }}
              />
            </div>
            <div
              data-fit-tier={label.tier}
              style={{
                textAlign: 'center',
                fontFamily: 'var(--reel-mono)',
                fontWeight: 500,
                letterSpacing: '0.02em',
                color: 'color-mix(in oklab, var(--reel-ink) 68%, transparent)',
                ...label.style,
              }}
            >
              {it.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
