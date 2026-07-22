// A "ranked" finish as an airport split-flap departures board: each row's label is set as a run of
// individual monospace character cells — one fixed-width flap per character, so a row's width is
// bounded by its own character count (which coercion already caps at SLOT_BUDGET.label, 24) rather
// than by anything this component has to measure or guess. The score/percentage lands in its own
// "gate" column on the right. Rows flip in with a per-ROW rotateX (not per character cell), so a
// five-item board only ever animates five elements at once.
import type { SlideProps } from '../types';

const CELL_W = 'calc(var(--rw) * 2.5)';

export function DeparturesSlide({ slots }: SlideProps<'ranked'>) {
  const items = slots.items.slice(0, 5);
  return (
    <div className="reel-fade" style={{ width: 'calc(var(--rw) * 84)', maxWidth: '92%' }}>
      <style>{`@keyframes dep-flap{from{opacity:0;transform:rotateX(-90deg)}to{opacity:1;transform:rotateX(0deg)}}`}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '0 calc(var(--rw) * 1)',
          marginBottom: 'calc(var(--ru) * 1.6)',
          font: '600 calc(var(--ru) * 1.9)/1 var(--reel-mono)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'color-mix(in oklab, var(--reel-ink) 55%, transparent)',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 'calc(var(--rw) * 2)',
          }}
        >
          {slots.title || 'Departures'}
        </span>
        <span style={{ flexShrink: 0 }}>Gate</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--ru) * 1)' }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--rw) * 2.4)',
              padding: 'calc(var(--ru) * 1.4) calc(var(--rw) * 1)',
              borderRadius: 'calc(var(--ru) * 1.2)',
              background: 'color-mix(in oklab, #000 30%, transparent)',
              transformOrigin: 'center',
              animation: `dep-flap 0.5s cubic-bezier(0.3,0.6,0.3,1) ${i * 0.12}s both`,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                font: '700 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
                color: 'color-mix(in oklab, var(--reel-ink) 45%, transparent)',
                width: 'calc(var(--rw) * 3)',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>

            <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {it.label
                .toUpperCase()
                .split('')
                .map((ch, ci) => (
                  <span
                    key={ci}
                    style={{
                      flexShrink: 0,
                      width: CELL_W,
                      height: 'calc(var(--ru) * 3.4)',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '2px',
                      background: 'color-mix(in oklab, #000 45%, transparent)',
                      font: '700 calc(var(--ru) * 2.1)/1 var(--reel-mono)',
                      color: 'var(--reel-ink)',
                    }}
                  >
                    {ch === ' ' ? '' : ch}
                  </span>
                ))}
            </div>

            <span
              style={{
                flexShrink: 0,
                minWidth: 'calc(var(--rw) * 11)',
                textAlign: 'center',
                padding: 'calc(var(--ru) * 0.9) calc(var(--rw) * 1.6)',
                borderRadius: 'calc(var(--ru) * 1)',
                border: '1px solid color-mix(in oklab, var(--reel-accent) 55%, transparent)',
                font: '700 calc(var(--ru) * 2.2)/1 var(--reel-mono)',
                color: 'var(--reel-accent)',
              }}
            >
              {it.score || `${it.pct}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
