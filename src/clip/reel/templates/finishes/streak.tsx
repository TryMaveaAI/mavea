// A habit-streak "finish" for a stat: the count blazes next to a flame, with a contribution-style
// heatmap underneath — the GitHub-grid mental model that makes a streak feel like accumulated days.
// Each cell's intensity steps the accent's opacity; intensity comes from `spark` when the turn gave a
// trend, else a gentle deterministic wave so an empty grid still reads as a lived-in habit. Color is
// all palette vars; the only bespoke motion is a per-cell fade-in, scoped to a prefixed keyframe.
import { Card } from '../primitives';
import type { SlideProps } from '../types';
import { fitLine, VALUE_TIERS, type Ladder } from '../fitText';

// The unit rides at 5/16 of the hero count, so it takes the stat ramp scaled to that size and
// shrinks in step with its own length.
const UNIT_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (5 / 16) }));

// A 7-wide board (a week per row) of five rows — enough to feel like a real history without crowding.
const COLS = 7;
const ROWS = 5;
const CELLS = COLS * ROWS;

// Five visible heat steps, lightest → fullest. Index 0 stays a faint track so empty days still show.
const HEAT = [6, 26, 46, 68, 100];

export function StreakSlide({ slots }: SlideProps<'stat'>) {
  // Build a per-cell intensity (0–4). With a spark, resample its trend across the grid; without one,
  // ride a slow sine so the board looks pleasantly varied rather than uniform.
  const spark = slots.spark && slots.spark.length >= 2 ? slots.spark : null;
  const sMax = spark ? Math.max(...spark) : 1;
  const sMin = spark ? Math.min(...spark) : 0;
  const sSpan = sMax - sMin || 1;
  const level = (i: number): number => {
    if (spark) {
      const v = spark[Math.round((i / (CELLS - 1)) * (spark.length - 1))];
      return Math.round(((v - sMin) / sSpan) * (HEAT.length - 1));
    }
    return Math.round(((Math.sin(i * 0.7) + 1) / 2) * (HEAT.length - 1));
  };

  // The count is never ellipsized — the tier shrinks it by length (its inline size/line override
  // .reel-bignum's flat 17ru; the class still carries weight, tracking and color).
  const value = fitLine(slots.value + (slots.unit ?? ''), VALUE_TIERS);
  const unit = slots.unit ? fitLine(slots.value + slots.unit, UNIT_TIERS) : undefined;

  return (
    <Card kicker="Streak">
      <style>{`@keyframes streak-cell{from{opacity:0;transform:scale(0.4)}to{opacity:1;transform:scale(1)}}`}</style>

      {/* The headline: the count blazing beside a flame, with the habit name on a quieter line. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'calc(var(--rw) * 2)',
          marginTop: 'calc(var(--ru) * 2)',
        }}
      >
        <span className="reel-bignum" data-fit-tier={value.tier} style={value.style}>
          {slots.value}
        </span>
        <span
          style={{ font: '400 calc(var(--ru) * 9)/1', filter: 'saturate(1.1)' }}
          aria-hidden="true"
        >
          🔥
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
      <div
        style={{
          font: '600 calc(var(--ru) * 3)/1.3 var(--reel-sans)',
          color: 'color-mix(in oklab, var(--reel-ink) 72%, transparent)',
          marginTop: 'calc(var(--ru) * 0.8)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {slots.label}
      </div>

      {/* The heatmap: small rounded squares, each a stepped accent opacity, popping in row by row. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: 'calc(var(--rw) * 1.4)',
          marginTop: 'calc(var(--ru) * 3.4)',
        }}
      >
        {Array.from({ length: CELLS }, (_, i) => (
          <span
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: 'calc(var(--ru) * 1.4)',
              background: `color-mix(in oklab, var(--reel-accent) ${HEAT[level(i)]}%, transparent)`,
              animation: `streak-cell 0.4s cubic-bezier(0.2,0.7,0.3,1) ${i * 0.02}s both`,
            }}
          />
        ))}
      </div>

      {slots.prior && (
        <div
          style={{
            font: '500 calc(var(--ru) * 2.7)/1.4 var(--reel-sans)',
            color: 'color-mix(in oklab, var(--reel-ink) 64%, transparent)',
            marginTop: 'calc(var(--ru) * 2.8)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {slots.prior}
        </div>
      )}
    </Card>
  );
}
