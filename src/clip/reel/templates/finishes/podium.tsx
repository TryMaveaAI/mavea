// A "ranked" finish as an Olympic 3-block podium: the top three items in the classic 2nd–1st–3rd
// arrangement, block height mapped to each one's score percentage, a rank medallion in a palette
// accent hue on top of each block, and any items past third place trailing below as small chips.
import type { SlideProps } from '../types';

const MEDAL = ['var(--reel-accent)', 'var(--reel-orb-1)', 'var(--reel-accent-2)'];
// Fixed block-height ratios per podium position (tallest at 1st) — a floor under the real pct so a
// missing or 0% score still reads as a podium, not a flat line; the real pct still SETS the height
// whenever it says more than that floor.
const FLOOR = [46, 34, 24];
// Rendered left→right as 2nd, 1st, 3rd — the classic podium read; these index into `top` (rank order).
const LAYOUT = [1, 0, 2];

export function PodiumSlide({ slots }: SlideProps<'ranked'>) {
  const top = slots.items.slice(0, 3);
  const rest = slots.items.slice(3, 5);
  const maxHeight = 30; // ru — the 1st-place block's ceiling; the rest scale relative to it below
  return (
    <div className="reel-fade" style={{ width: 'calc(var(--rw) * 84)', maxWidth: '92%' }}>
      {slots.title && (
        <div
          style={{
            textAlign: 'center',
            font: '600 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'color-mix(in oklab, var(--reel-ink) 55%, transparent)',
            marginBottom: 'calc(var(--ru) * 3)',
          }}
        >
          {slots.title}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 'calc(var(--rw) * 2.6)',
        }}
      >
        {LAYOUT.filter((rank) => top[rank]).map((rank) => {
          const it = top[rank];
          const heightRu = Math.max(FLOOR[rank], it.pct) * (maxHeight / 100);
          const color = MEDAL[rank];
          return (
            <div
              key={rank}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 'calc(var(--rw) * 22)',
              }}
            >
              <div
                style={{
                  width: 'calc(var(--ru) * 5.4)',
                  height: 'calc(var(--ru) * 5.4)',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: color,
                  color: '#fff',
                  fontWeight: 800,
                  fontFamily: 'var(--reel-sans)',
                  fontSize: 'calc(var(--ru) * 2.6)',
                  boxShadow: `0 0 calc(var(--ru) * 3) color-mix(in oklab, ${color} 60%, transparent)`,
                  marginBottom: 'calc(var(--ru) * 1.4)',
                  animation: `reel-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) ${rank * 0.12}s both`,
                }}
              >
                {rank + 1}
              </div>
              <div
                style={{
                  width: '100%',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  font: '700 calc(var(--ru) * 2.5)/1.2 var(--reel-sans)',
                  color: 'var(--reel-ink)',
                  marginBottom: 'calc(var(--ru) * 0.6)',
                }}
              >
                {it.label}
              </div>
              <div
                style={{
                  font: '600 calc(var(--ru) * 2.1)/1 var(--reel-mono)',
                  color,
                  marginBottom: 'calc(var(--ru) * 1.2)',
                }}
              >
                {it.score || `${it.pct}%`}
              </div>
              <div
                style={{
                  width: '100%',
                  height: `calc(var(--ru) * ${heightRu.toFixed(2)})`,
                  borderRadius: 'calc(var(--ru) * 1.4) calc(var(--ru) * 1.4) 0 0',
                  background: `linear-gradient(180deg, ${color}, color-mix(in oklab, ${color} 62%, transparent))`,
                  transformOrigin: 'bottom',
                  animation: `reel-grow-bar 0.7s cubic-bezier(0.3,0.7,0.3,1) ${0.1 + rank * 0.12}s both`,
                }}
              />
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 'calc(var(--ru) * 1.4) calc(var(--rw) * 2)',
            marginTop: 'calc(var(--ru) * 3)',
          }}
        >
          {rest.map((it, i) => (
            <span
              key={i}
              style={{
                padding: 'calc(var(--ru) * 1.2) calc(var(--rw) * 2.6)',
                borderRadius: 999,
                font: '600 calc(var(--ru) * 2.2)/1 var(--reel-sans)',
                color: 'var(--reel-ink)',
                background: 'color-mix(in oklab, var(--reel-ink) 8%, transparent)',
                border: '1px solid color-mix(in oklab, var(--reel-ink) 14%, transparent)',
                animation: `reel-pop 0.4s cubic-bezier(0.2,0.7,0.3,1) ${0.5 + i * 0.08}s both`,
              }}
            >
              {`${i + 4}. ${it.label}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
