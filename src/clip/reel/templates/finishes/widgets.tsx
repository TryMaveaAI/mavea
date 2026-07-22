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
      <style>{`
        .reel-widgets { position: relative; display: flex; flex-direction: column; gap: calc(var(--ru) * 3);
          width: calc(var(--rw) * 70); padding: calc(var(--ru) * 5) calc(var(--rw) * 5); border-radius: calc(var(--ru) * 7); isolation: isolate; overflow: hidden; }
        .reel-widgets::before { content: ''; position: absolute; inset: -10%; z-index: -1;
          background:
            radial-gradient(38% 38% at 22% 18%, var(--reel-orb-1) 0%, transparent 70%),
            radial-gradient(42% 42% at 82% 30%, var(--reel-accent-2) 0%, transparent 72%),
            radial-gradient(46% 46% at 30% 88%, var(--reel-accent) 0%, transparent 72%),
            radial-gradient(40% 40% at 88% 86%, var(--reel-orb-2) 0%, transparent 74%);
          filter: blur(calc(var(--ru) * 2)) saturate(1.1);
          animation: widgets-mesh 14s ease-in-out infinite alternate; }
        .reel-widget-tile { position: relative; border-radius: calc(var(--ru) * 5); padding: calc(var(--ru) * 3.4) calc(var(--rw) * 4);
          background: rgba(255, 255, 255, 0.34);
          border: 1px solid rgba(255, 255, 255, 0.55);
          box-shadow: 0 calc(var(--ru) * 3) calc(var(--ru) * 8) calc(var(--ru) * -4) rgba(20, 16, 44, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(10px) saturate(1.4);
          animation: widgets-tile 0.66s cubic-bezier(0.2, 0.8, 0.25, 1) both; }
        .reel-widget-row { display: grid; grid-template-columns: 1fr; gap: calc(var(--ru) * 3); }
        @keyframes widgets-mesh {
          from { transform: translate(0, 0) scale(1); }
          to { transform: translate(calc(var(--rw) * -2.4), calc(var(--ru) * 2)) scale(1.08); } }
        @keyframes widgets-tile {
          from { opacity: 0; transform: translateY(calc(var(--ru) * 2.6)) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div className="reel-widget-tile" style={{ animationDelay: '0.04s' }}>
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
