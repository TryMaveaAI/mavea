// SortingViz — animated sorting algorithm visualizer. Each step carries a full array snapshot;
// bars change height and colour to show what the algorithm is doing. Colour roles: compared
// (warning), swapped (insight), sorted (presence, permanent), pivot (--danger/red, quicksort).
// Play/pause auto-advance + three speed levels; an ops badge counts comparisons and swaps.
// The model supplies the array and steps; geometry is computed — no hard-coded coordinates.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SortingVizProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SortingVizProps & { delay?: number };

// Speed: ms between auto-steps
const SPEEDS = [600, 250, 80] as const;
const SPEED_LABELS = ['1×', '2×', '4×'] as const;

// Bar cell role → CSS class suffix
type BarRole = 'sorted' | 'pivot' | 'compared' | 'swapped' | 'default';

function roleOf(step: SortingVizProps['steps'][0] | undefined, i: number): BarRole {
  if (!step) return 'default';
  if (step.sorted?.includes(i)) return 'sorted';
  if (step.pivot === i) return 'pivot';
  if (step.compared?.includes(i)) return 'compared';
  if (step.swapped?.includes(i)) return 'swapped';
  return 'default';
}

// Complexity badge label → display string
function formatComplexity(cls?: string): string {
  if (!cls) return '';
  const map: Record<string, string> = {
    'o-1': 'O(1)',
    'o-logn': 'O(log n)',
    'o-n': 'O(n)',
    'o-nlogn': 'O(n log n)',
    'o-n2': 'O(n²)',
    'o-2n': 'O(2ⁿ)',
  };
  return map[cls] ?? cls;
}

export function SortingViz({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  algorithm,
  complexity,
  values,
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;
  const total = steps.length;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedTier, setSpeedTier] = useState(1); // 0=slow, 1=normal, 2=fast
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cur = steps[Math.min(idx, total - 1)];
  const displayValues = cur?.values ?? values;
  const maxVal = Math.max(1, ...displayValues.map((v) => Math.abs(v)));

  // Count comparisons + swaps across all steps up to (and including) current
  const ops = steps.slice(0, idx + 1).reduce(
    (acc, s) => ({
      cmp: acc.cmp + (s.compared?.length ? 1 : 0),
      swap: acc.swap + (s.swapped?.length ? 1 : 0),
    }),
    { cmp: 0, swap: 0 },
  );

  const at = useCallback((i: number) => setIdx(Math.min(total - 1, Math.max(0, i))), [total]);

  // Auto-play: advance one step at the chosen speed
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (idx >= total - 1) {
      setPlaying(false);
      return;
    }
    timerRef.current = setTimeout(
      () => setIdx((i) => Math.min(total - 1, i + 1)),
      SPEEDS[speedTier],
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, idx, total, speedTier]);

  const togglePlay = () => {
    if (idx >= total - 1) {
      setIdx(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {/* Header */}
      <div className="dg-sv-header">
        <div className="card-eyebrow" style={{ marginBottom: 0 }}>
          <Ic className="ic" style={{ color: iconColor }} />
          {title ?? algorithm}
        </div>
        <div className="dg-sv-badges">
          {complexity && <span className="dg-sv-badge">{formatComplexity(complexity)}</span>}
          <span className="dg-sv-badge dg-sv-ops">
            {ops.cmp} cmp · {ops.swap} swap
          </span>
        </div>
      </div>

      {/* Step caption */}
      <p className="dg-at-caption" aria-live="polite">
        {cur?.caption ?? ''}
      </p>

      {/* Bar chart */}
      <div className="dg-sv-bars" aria-label="sorting visualization" role="img">
        {displayValues.map((v, i) => {
          const role = roleOf(cur, i);
          const pct = Math.round((Math.abs(v) / maxVal) * 100);
          return (
            <div key={i} className="dg-sv-bar-wrap">
              <div
                className={`dg-sv-bar role-${role}`}
                style={{ height: `${pct}%` } as CSSProperties}
                aria-label={String(v)}
              />
              {displayValues.length <= 16 && (
                <span
                  className="dg-sv-val"
                  style={
                    {
                      display: 'inline-block',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    } as CSSProperties
                  }
                >
                  {v}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="dg-at-controls">
        <button
          type="button"
          className="dg-at-btn"
          onClick={() => {
            setPlaying(false);
            at(idx - 1);
          }}
          disabled={idx === 0}
          aria-label="previous step"
        >
          <Icon.chevL className="ic" /> Prev
        </button>

        <button
          type="button"
          className="dg-at-btn dg-sv-play"
          onClick={togglePlay}
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? '⏸' : idx >= total - 1 ? '↺' : '▶'}
        </button>

        <div className="dg-at-progress" aria-hidden="true">
          {steps.length <= 30 &&
            steps.map((_, i) => (
              <span
                key={i}
                className={'dg-at-dot' + (i === idx ? ' on' : i < idx ? ' done' : '')}
              />
            ))}
          {steps.length > 30 && (
            <span className="dg-sv-step-count">
              {idx + 1} / {total}
            </span>
          )}
        </div>

        <button
          type="button"
          className="dg-at-btn dg-sv-speed"
          onClick={() => setSpeedTier((t) => (t + 1) % 3)}
          aria-label={`speed: ${SPEED_LABELS[speedTier]}`}
        >
          {SPEED_LABELS[speedTier]}
        </button>

        <button
          type="button"
          className="dg-at-btn"
          onClick={() => {
            setPlaying(false);
            at(idx + 1);
          }}
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
