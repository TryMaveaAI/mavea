// Finishes for numbers: one hero stat, a few progress rings, a ranked bar board, and a bento recap.
// Series colors cycle through the palette's CSS variables, so every finish recolors with the reel.
import type { CSSProperties } from 'react';
import type { SlideProps } from './types';
import { Card, Ring, Bar, Spark } from './primitives';
import { fitLine, VALUE_TIERS, type Ladder } from './fitText';

const SERIES = [
  'var(--reel-accent)',
  'var(--reel-orb-1)',
  'var(--reel-accent-2)',
  'var(--reel-orb-2)',
];

const dim: CSSProperties = {
  color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
};

// The stat ramp is calibrated for the 16ru hero value; the unit and the bento values run smaller by
// design, so they ride the same ladder scaled to their own size — long content steps down in
// lockstep with the hero instead of outgrowing its slot.
const UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (7 / 16) }));
const BENTO_VALUE_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (5 / 16) }));

export function BigStatSlide({ slots }: SlideProps<'stat'>) {
  // Numbers are never ellipsized — the tier shrinks with length (its inline size/line override
  // .reel-bignum's flat 17ru; the class still carries weight, tracking and color).
  const value = fitLine(slots.value + (slots.unit ?? ''), VALUE_TIERS);
  const unit = slots.unit ? fitLine(slots.unit, UNIT_TIERS) : undefined;
  return (
    <Card kicker={slots.label}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'calc(var(--rw) * 1.2)',
          marginTop: 'calc(var(--ru) * 2)',
        }}
      >
        <span className="reel-bignum" data-fit-tier={value.tier} style={value.style}>
          {slots.value}
        </span>
        {slots.unit && unit && (
          <span
            data-fit-tier={unit.tier}
            style={{
              fontWeight: 700,
              fontFamily: 'var(--reel-sans)',
              color: 'var(--reel-accent)',
              ...unit.style,
            }}
          >
            {slots.unit}
          </span>
        )}
      </div>
      {slots.prior && (
        <div
          style={{
            font: '500 calc(var(--ru) * 2.9)/1.4 var(--reel-sans)',
            marginTop: 'calc(var(--ru) * 1.6)',
            ...dim,
          }}
        >
          {slots.prior}
        </div>
      )}
      {slots.spark && slots.spark.length >= 2 && (
        <div style={{ marginTop: 'calc(var(--ru) * 3)' }}>
          <Spark points={slots.spark} color="var(--reel-accent)" />
        </div>
      )}
    </Card>
  );
}

export function ProgressRingsSlide({ slots }: SlideProps<'metrics'>) {
  return (
    <Card kicker="Where you stand">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 2.4)',
          marginTop: 'calc(var(--ru) * 2.4)',
        }}
      >
        {slots.items.map((it, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--rw) * 3)' }}
          >
            <Ring pct={it.pct} color={SERIES[i % SERIES.length]} delay={i * 0.12} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  font: '600 calc(var(--ru) * 3)/1.1 var(--reel-sans)',
                  color: 'var(--reel-ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.label}
              </div>
              <div
                style={{
                  font: '700 calc(var(--ru) * 3.6)/1 var(--reel-sans)',
                  color: SERIES[i % SERIES.length],
                }}
              >
                {it.pct}%
              </div>
            </div>
          </div>
        ))}
      </div>
      {slots.next && (
        <div
          style={{
            font: '500 calc(var(--ru) * 2.7)/1.4 var(--reel-sans)',
            marginTop: 'calc(var(--ru) * 2.4)',
            ...dim,
          }}
        >
          {slots.next}
        </div>
      )}
    </Card>
  );
}

export function ScoreboardSlide({ slots }: SlideProps<'ranked'>) {
  return (
    <Card kicker={slots.title || 'Scoreboard'}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--ru) * 2.6)',
          marginTop: 'calc(var(--ru) * 2.6)',
        }}
      >
        {slots.items.map((it, i) => (
          <Bar
            key={i}
            label={it.label}
            value={it.score}
            pct={it.pct}
            color={SERIES[i % SERIES.length]}
            delay={i * 0.12}
          />
        ))}
      </div>
    </Card>
  );
}

export function RecapBentoSlide({ slots }: SlideProps<'recap'>) {
  return (
    <Card kicker="Session recap">
      <h3>{slots.topic}</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'calc(var(--ru) * 2)',
          marginTop: 'calc(var(--ru) * 3)',
        }}
      >
        {slots.metrics.map((m, i) => {
          // A bento cell is half the card wide, so its value steps down by length like the hero's.
          const value = fitLine(m.value, BENTO_VALUE_TIERS);
          return (
            <div
              key={i}
              style={{
                padding: 'calc(var(--ru) * 2.6) calc(var(--rw) * 3)',
                borderRadius: 'calc(var(--ru) * 2.4)',
                background: 'color-mix(in oklab, var(--reel-accent) 12%, transparent)',
                animation: `reel-pop 0.5s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.1}s both`,
              }}
            >
              <div
                data-fit-tier={value.tier}
                style={{
                  fontWeight: 700,
                  fontFamily: 'var(--reel-sans)',
                  color: 'var(--reel-accent)',
                  ...value.style,
                }}
              >
                {m.value}
              </div>
              <div
                style={{
                  font: '500 calc(var(--ru) * 2.3)/1.2 var(--reel-mono)',
                  marginTop: 'calc(var(--ru) * 0.8)',
                  ...dim,
                }}
              >
                {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
