// A recap finish staged as a macOS Finder window: a traffic-light title bar carries the topic, a thin
// left sidebar lists "Favorites", and each metric becomes a file row — a document icon, its label as the
// filename, its value in the size column — with the first (headline) row selected in accent, the way a
// Finder selection reads. A real window's chrome (the title bar gradient, the sidebar and list grays, the
// near-white field) is an intrinsic desktop identity that doesn't tint with the reel, so those neutrals
// live in a scoped <style>; the selection, the value column and the leading folder lean on palette vars.
// Rows cascade in via a bespoke finder-row so the listing feels like it's populating as the window opens.
import type { SlideProps } from '../types';

// A few stable sidebar entries — pure window dressing that grounds the Finder look without inventing data.
const FAVORITES = ['Recents', 'Documents', 'Session'];

export function FinderSlide({ slots }: SlideProps<'recap'>) {
  const { topic, metrics } = slots;
  return (
    <div
      style={{
        width: 'calc(var(--rw) * 84)',
        borderRadius: 'calc(var(--ru) * 2.2)',
        overflow: 'hidden',
        background: 'var(--finder-window)',
        border: '1px solid var(--finder-edge)',
        boxShadow:
          '0 calc(var(--ru) * 8) calc(var(--ru) * 18) calc(var(--ru) * -8) rgba(12, 10, 28, 0.6)',
        // forwards, not both: zero delay, so this costs nothing visible and avoids the window staying
        // blank if the tab was backgrounded when it mounted (a stalled `backwards` fill holds opacity 0).
        animation: 'reel-pop 0.55s cubic-bezier(0.2,0.7,0.3,1) forwards',
      }}
    >
      <style>{`
        .reel[data-palette] {
          --finder-window: #f4f5f7;
          --finder-sidebar: #e8e9ed;
          --finder-titlebar: linear-gradient(180deg, #e9eaee 0%, #dcdee3 100%);
          --finder-edge: rgba(20, 18, 40, 0.16);
          --finder-line: rgba(20, 18, 40, 0.08);
          --finder-text: #2c2e36;
          --finder-mute: rgba(44, 46, 54, 0.5);
        }
        @keyframes finder-row {
          from { opacity: 0; transform: translateX(calc(var(--rw) * -1.4)); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Title bar: the three traffic lights, then the window's title centered on the topic. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--rw) * 1.4)',
          padding: 'calc(var(--ru) * 1.8) calc(var(--rw) * 2.6)',
          background: 'var(--finder-titlebar)',
          borderBottom: '1px solid var(--finder-line)',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span
            key={c}
            style={{
              width: 'calc(var(--ru) * 1.8)',
              height: 'calc(var(--ru) * 1.8)',
              borderRadius: '50%',
              background: c,
            }}
          />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            paddingRight: 'calc(var(--rw) * 8)',
            font: '600 calc(var(--ru) * 2.5)/1 var(--reel-sans)',
            color: 'var(--finder-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {topic}
        </span>
      </div>

      {/* The split body: a thin sidebar of Favorites beside the file listing. */}
      <div style={{ display: 'flex' }}>
        <div
          style={{
            width: '26%',
            padding: 'calc(var(--ru) * 2.4) calc(var(--rw) * 1.8)',
            background: 'var(--finder-sidebar)',
            borderRight: '1px solid var(--finder-line)',
          }}
        >
          <div
            style={{
              font: '700 calc(var(--ru) * 1.7)/1 var(--reel-mono)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--finder-mute)',
              marginBottom: 'calc(var(--ru) * 1.6)',
            }}
          >
            Favorites
          </div>
          {FAVORITES.map((f, i) => (
            <div
              key={f}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(var(--rw) * 1.2)',
                padding: 'calc(var(--ru) * 1.1) 0',
                font: '500 calc(var(--ru) * 2.2)/1.1 var(--reel-sans)',
                color: 'var(--finder-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <svg
                viewBox="0 0 24 18"
                style={{ width: 'calc(var(--ru) * 3)', flexShrink: 0 }}
                aria-hidden="true"
              >
                <path
                  d="M2 4 a2 2 0 0 1 2-2 h5 l2 2 h9 a2 2 0 0 1 2 2 v8 a2 2 0 0 1-2 2 H4 a2 2 0 0 1-2-2 Z"
                  fill={
                    i === 1
                      ? 'var(--reel-accent)'
                      : 'color-mix(in oklab, var(--reel-accent) 60%, var(--finder-mute))'
                  }
                />
              </svg>
              {f}
            </div>
          ))}
        </div>

        {/* The file list: one metric per row, first row selected in accent. */}
        <div style={{ flex: 1, minWidth: 0, padding: 'calc(var(--ru) * 1.2) 0' }}>
          {metrics.map((m, i) => {
            const selected = i === 0;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'calc(var(--rw) * 1.8)',
                  padding: 'calc(var(--ru) * 1.8) calc(var(--rw) * 2.6)',
                  background: selected ? 'var(--reel-accent)' : 'transparent',
                  borderTop: i ? '1px solid var(--finder-line)' : 'none',
                  animation: `finder-row 0.4s cubic-bezier(0.2,0.7,0.3,1) ${0.15 + i * 0.1}s both`,
                }}
              >
                <svg
                  viewBox="0 0 20 24"
                  style={{ width: 'calc(var(--ru) * 3.6)', flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <path
                    d="M3 1 h9 l5 5 v17 H3 Z"
                    fill={
                      selected
                        ? 'rgba(255,255,255,0.92)'
                        : 'color-mix(in oklab, var(--reel-ink) 14%, #fff)'
                    }
                    stroke={selected ? 'transparent' : 'var(--finder-line)'}
                  />
                  <path
                    d="M12 1 v5 h5 Z"
                    fill={selected ? 'rgba(255,255,255,0.7)' : 'var(--finder-mute)'}
                  />
                </svg>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    font: '600 calc(var(--ru) * 2.6)/1.2 var(--reel-sans)',
                    color: selected ? '#fff' : 'var(--finder-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {m.label}
                </span>
                <span
                  style={{
                    font: '600 calc(var(--ru) * 2.6)/1.2 var(--reel-mono)',
                    color: selected ? 'rgba(255,255,255,0.92)' : 'var(--reel-accent)',
                    flexShrink: 0,
                  }}
                >
                  {m.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status bar: the item count a Finder window shows along its bottom edge. */}
      <div
        style={{
          padding: 'calc(var(--ru) * 1.4) calc(var(--rw) * 2.6)',
          borderTop: '1px solid var(--finder-line)',
          font: '500 calc(var(--ru) * 1.9)/1 var(--reel-mono)',
          letterSpacing: '0.04em',
          color: 'var(--finder-mute)',
          textAlign: 'center',
        }}
      >
        {`${metrics.length} ${metrics.length === 1 ? 'item' : 'items'}`}
      </div>
    </div>
  );
}
