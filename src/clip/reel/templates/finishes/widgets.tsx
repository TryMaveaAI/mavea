// A "recap" finish styled as an iOS Home Screen widget stack: a soft mesh-gradient backdrop with a
// column of frosted-glass tiles — a wide topic tile up top, then one square metric tile per number.
// The mesh blobs and tile colors are palette-driven so the whole stack recolors with the reel; the
// only scoped color is the tile glass tint (an intrinsic "frosted iOS" identity, not a palette hue).
import type { SlideProps } from '../types';
import { fitLine, fitText, TITLE_TIERS, VALUE_TIERS, type Ladder } from '../fitText';

// The frosted tiles ride the shared ladders scaled to the stack: the topic at 4.6/5.4 of the title
// ramp, each metric value at 8/16 of the stat ramp — long content steps down instead of wrapping
// into a tower (and a number never wraps or ellipsizes). Tiles run one per row: a half-width tile
// can't seat even a four-character figure at display size, so the stack IS the column.
const TOPIC_TIERS: Ladder = TITLE_TIERS.map((t) => ({ ...t, size: t.size * (4.6 / 5.4) }));
const TILE_VALUE_TIERS: Ladder = VALUE_TIERS.map((t) => ({ ...t, size: t.size * (8 / 16) }));

export function WidgetsSlide({ slots }: SlideProps<'recap'>) {
  // Three metric tiles keep the stack at a clean four-tile column that fills the stage without crowding.
  const metrics = slots.metrics.slice(0, 3);
  const topic = fitText(slots.topic, TOPIC_TIERS);
  return (
    <div className="reel-widgets reel-fade">
      <div className="reel-widget-tile" data-tight-lockup="" style={{ animationDelay: '0.04s' }}>
        <div
          style={{
            font: '600 calc(var(--ru) * 2)/1 var(--reel-mono)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--reel-accent)',
          }}
        >
          Recap
        </div>
        <div
          data-fit-tier={topic.tier}
          style={{
            fontWeight: 700,
            fontFamily: 'var(--reel-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--reel-ink)',
            marginTop: 'calc(var(--ru) * 1.4)',
            ...topic.style,
          }}
        >
          {slots.topic}
        </div>
      </div>

      <div className="reel-widget-row">
        {metrics.map((m, i) => {
          const value = fitLine(m.value, TILE_VALUE_TIERS);
          return (
            <div
              key={i}
              className="reel-widget-tile"
              // A stat tile is a display lockup: the figure's line box meets its caption by design.
              data-tight-lockup=""
              style={{ animationDelay: `${0.16 + i * 0.1}s` }}
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
                  font: '500 calc(var(--ru) * 2.2)/1.2 var(--reel-mono)',
                  letterSpacing: '0.04em',
                  color: 'color-mix(in oklab, var(--reel-ink) 60%, transparent)',
                  marginTop: 'calc(var(--ru) * 1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
