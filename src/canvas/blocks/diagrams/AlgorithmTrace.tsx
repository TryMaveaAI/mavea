// AlgorithmTrace — an interactive step-through of an algorithm over an array. The values render
// as a row of cells; a prev/next stepper (local state, plus an optional auto-play timer) walks a
// list of authored steps, recolouring the cells each step touches — highlighted (the active
// window), compared, or swapped — and drawing labelled pointer carets (i, j, lo, hi) under the
// cells, with the step's caption above. Geometry is computed from the data; the model supplies
// only the values and what each step touches, so the trace is always correct and themes from
// tokens in light and dark.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AlgorithmTraceProps, AlgorithmStep } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AlgorithmTraceProps & { delay?: number };

const fmt = (v: string | number): string => (typeof v === 'number' ? String(v) : v);

/** Resolve a cell's visual role this step (later roles win, so a swap reads over a compare). */
type CellRole = 'swapped' | 'compared' | 'highlight' | 'none';
function roleOf(step: AlgorithmStep | undefined, i: number): CellRole {
  if (!step) return 'none';
  if (step.swapped?.includes(i)) return 'swapped';
  if (step.compare?.includes(i)) return 'compared';
  if (step.highlight?.includes(i)) return 'highlight';
  return 'none';
}

const SPEEDS = [900, 350, 100] as const;
const SPEED_LABELS = ['1×', '2×', '8×'] as const;

function formatComplexity(cls?: string): string {
  const map: Record<string, string> = {
    'o-1': 'O(1)',
    'o-logn': 'O(log n)',
    'o-n': 'O(n)',
    'o-nlogn': 'O(n log n)',
    'o-n2': 'O(n²)',
    'o-2n': 'O(2ⁿ)',
  };
  return cls ? (map[cls] ?? cls) : '';
}

export function AlgorithmTrace({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  values,
  steps,
  complexity,
  autoPlay,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const total = Math.max(1, steps.length);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(autoPlay ?? false);
  const [speedTier, setSpeedTier] = useState(1);
  // Ref lets the interval callback read the latest idx without re-creating the interval.
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const cur = steps[Math.min(idx, steps.length - 1)];

  // Auto-play: advance one step per PLAY_MS. Stop at the last step or when paused.
  // Respects prefers-reduced-motion by never starting.
  const prefersReduced = useRef(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = idxRef.current + 1;
      if (next >= steps.length) {
        setPlaying(false);
        return;
      }
      setIdx(next);
    }, SPEEDS[speedTier]);
    return () => clearInterval(id);
  }, [playing, steps.length, speedTier]);

  const at = useCallback(
    (i: number) => {
      setPlaying(false);
      setIdx(Math.min(steps.length - 1, Math.max(0, i)));
    },
    [steps.length],
  );

  const togglePlay = useCallback(() => {
    if (prefersReduced.current) return;
    setPlaying((p) => {
      // Restart from beginning if already at the end
      if (!p && idx >= steps.length - 1) setIdx(0);
      return !p;
    });
  }, [idx, steps.length]);

  // The pointers active this step, in a stable display order so they don't jump between steps.
  const pointers = useMemo(() => {
    const p = cur?.pointer;
    if (!p) return [] as { label: string; index: number }[];
    return Object.entries(p)
      .filter(([, v]) => Number.isFinite(v) && v >= 0 && v < values.length)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([label, index]) => ({ label, index }));
  }, [cur, values.length]);

  // Group pointers per cell so labels sharing a column stack instead of colliding.
  const pointersByCell = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const pt of pointers) {
      const list = m.get(pt.index) ?? [];
      list.push(pt.label);
      m.set(pt.index, list);
    }
    return m;
  }, [pointers]);
  const hasPointers = pointers.length > 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title}
        {complexity && (
          <span
            className="dg-at-complexity"
            title={`Time complexity: ${formatComplexity(complexity)}`}
          >
            {formatComplexity(complexity)}
          </span>
        )}
      </div>

      <p className="dg-at-caption" aria-live="polite">
        {cur?.caption ?? ''}
      </p>

      {/* Cells and the pointer band share one flex track (same gap + per-cell width) so a caret
          always sits under its column, however the row wraps on a narrow card. */}
      <div className="dg-at-row" role="group" aria-label="array">
        {values.map((v, i) => {
          const role = roleOf(cur, i);
          const ptrs = pointersByCell.get(i);
          return (
            <div key={i} className="dg-at-cell-wrap">
              <div className={`dg-at-cell role-${role}`}>{fmt(v)}</div>
              <div className="dg-at-idx">{i}</div>
              {hasPointers && (
                <div className="dg-at-ptr-slot">
                  {ptrs && (
                    <>
                      <span className="dg-at-ptr-caret" aria-hidden="true" />
                      <span className="dg-at-ptr-labels">{ptrs.join(' · ')}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
            aria-label={`speed: ${SPEED_LABELS[speedTier]}`}
          >
            {SPEED_LABELS[speedTier]}
          </button>
        )}
        <div className="dg-at-progress" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={'dg-at-dot' + (i === idx ? ' on' : i < idx ? ' done' : '')} />
          ))}
        </div>
        <span className="dg-at-count">
          {Math.min(idx + 1, total)} / {total}
        </span>
        <button
          type="button"
          className="dg-at-btn"
          onClick={() => at(idx + 1)}
          disabled={idx >= steps.length - 1}
          aria-label="next step"
        >
          Next <Icon.chevR className="ic" />
        </button>
      </div>

      {cur?.ops && (
        <div className="dg-at-ops">
          {cur.ops.comparisons !== undefined && <span>{cur.ops.comparisons} cmp</span>}
          {cur.ops.comparisons !== undefined && cur.ops.swaps !== undefined && (
            <span className="dg-at-ops-sep">·</span>
          )}
          {cur.ops.swaps !== undefined && <span>{cur.ops.swaps} swap</span>}
        </div>
      )}
      {caption && <p className="dg-at-cap">{caption}</p>}
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
