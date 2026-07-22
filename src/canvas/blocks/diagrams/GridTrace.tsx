// GridTrace — a 2-D grid visualizer for BFS/DFS, flood-fill, and grid-DP problems.
// Each step carries a full grid snapshot where every cell is coloured by its state:
// wall (dark), empty (default), queued (warning), current (presence), visited (muted),
// path (insight), start/end (presence/insight solid). Cells optionally show a value
// (distance, cost, character). Grid auto-scales to fit the card width.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GridTraceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GridTraceProps & { delay?: number };

// Cell size bounds — actual size is clamped to fit card width
const CELL_MIN = 22;
const CELL_MAX = 52;
const MAX_GRID = 20; // max rows or cols rendered

const PLAY_MS = [700, 280, 80] as const;
const PLAY_LABELS = ['1×', '2×', '8×'] as const;

export function GridTrace({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  algorithm,
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;
  const total = Math.max(1, steps.length);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedTier, setSpeedTier] = useState(1);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const prefersReduced = useRef(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const at = useCallback(
    (i: number) => {
      setPlaying(false);
      setIdx(Math.min(total - 1, Math.max(0, i)));
    },
    [total],
  );

  const togglePlay = useCallback(() => {
    if (prefersReduced.current) return;
    setPlaying((p) => {
      if (!p && idxRef.current >= total - 1) setIdx(0);
      return !p;
    });
  }, [total]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = idxRef.current + 1;
      if (next >= total) {
        setPlaying(false);
        return;
      }
      setIdx(next);
    }, PLAY_MS[speedTier]);
    return () => clearInterval(id);
  }, [playing, total, speedTier]);

  const cur = steps[Math.min(idx, total - 1)];
  const grid = cur?.grid ?? [];

  const numRows = Math.min(MAX_GRID, grid.length);
  const numCols = Math.min(MAX_GRID, grid[0]?.length ?? 0);

  // Count queued cells for the info badge
  const queuedCount = grid
    .slice(0, numRows)
    .reduce(
      (sum, row) => sum + row.slice(0, numCols).filter((c) => c.state === 'queued').length,
      0,
    );
  const visitedCount = grid
    .slice(0, numRows)
    .reduce(
      (sum, row) =>
        sum +
        row.slice(0, numCols).filter((c) => c.state === 'visited' || c.state === 'path').length,
      0,
    );

  // Decide whether value labels fit (only when cells are wide enough)
  const showValues = grid.some((row) => row.some((c) => c.value !== undefined));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title ?? (algorithm ? `${algorithm} on a Grid` : 'Grid Trace')}
        {algorithm && <span className="gt2-algo-badge">{algorithm}</span>}
      </div>

      <p className="dg-at-caption" aria-live="polite">
        {cur?.caption ?? ''}
      </p>

      {/* Grid */}
      <div
        className="gt2-grid"
        style={
          {
            '--gt2-cols': numCols,
            '--gt2-cell': `clamp(${CELL_MIN}px, calc((100% - 8px) / ${numCols}), ${CELL_MAX}px)`,
          } as CSSProperties
        }
        role="img"
        aria-label={title ?? 'grid'}
      >
        {grid.slice(0, numRows).map((row, r) =>
          row.slice(0, numCols).map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className={`gt2-cell gt2-${cell.state}`}
              title={`[${r},${c}]${cell.value !== undefined ? ` = ${cell.value}` : ''}`}
            >
              {showValues && cell.value !== undefined && (
                <span className="gt2-cell-val">{cell.value}</span>
              )}
            </div>
          )),
        )}
      </div>

      {/* Stats row */}
      <div className="gt2-stats">
        <span className="gt2-stat">
          <span className="gt2-dot gt2-dot-queued" />
          {queuedCount} queued
        </span>
        <span className="gt2-stat">
          <span className="gt2-dot gt2-dot-visited" />
          {visitedCount} visited
        </span>
      </div>

      {/* Controls */}
      <div className="dg-at-controls">
        <button
          type="button"
          className="dg-at-btn"
          onClick={() => at(idx - 1)}
          disabled={idx === 0}
          aria-label="previous step"
        >
          <Icon.chevL className="ic" /> Prev
        </button>
        {!prefersReduced.current && (
          <button
            type="button"
            className={'dg-at-btn dg-at-play' + (playing ? ' playing' : '')}
            onClick={togglePlay}
            aria-label={playing ? 'pause' : 'play'}
          >
            {playing ? <Icon.pause className="ic" /> : <Icon.play className="ic" />}
          </button>
        )}
        {!prefersReduced.current && (
          <button
            type="button"
            className="dg-at-btn dg-at-speed"
            onClick={() => setSpeedTier((t) => (t + 1) % 3)}
            aria-label={`speed: ${PLAY_LABELS[speedTier]}`}
          >
            {PLAY_LABELS[speedTier]}
          </button>
        )}
        <div className="dg-at-progress" aria-hidden="true">
          {total <= 30 &&
            steps.map((_, i) => (
              <span
                key={i}
                className={'dg-at-dot' + (i === idx ? ' on' : i < idx ? ' done' : '')}
              />
            ))}
        </div>
        <span className="dg-at-count">
          {idx + 1} / {total}
        </span>
        <button
          type="button"
          className="dg-at-btn"
          onClick={() => at(idx + 1)}
          disabled={idx >= total - 1}
          aria-label="next step"
        >
          Next <Icon.chevR className="ic" />
        </button>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
