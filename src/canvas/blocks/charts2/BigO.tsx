import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, ticks, niceStep } from '../../lib/scale';
import { spreadLabels } from '../../lib/spreadLabels';
import type { BigOProps, BigOClass } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BigOProps & { delay?: number };

const W = 340;
const H = 230;
const PAD_L = 38; // y tick labels
const PAD_R = 56; // room for the curve label that sits at the right edge
const PAD_T = 14;
const PAD_B = 26; // x tick labels + axis title

// The six canonical complexity classes, each a pure growth function of n. Counts are the
// raw operation estimate f(n); the chart caps the y-axis so the relative ORDER reads true
// (2^n dwarfs n^2 dwarfs n log n …) without the slow classes collapsing onto the x-axis.
const CLASSES: Record<BigOClass, { label: string; color: string; f: (n: number) => number }> = {
  'o-1': { label: 'O(1)', color: 'var(--text-muted)', f: () => 1 },
  'o-logn': { label: 'O(log n)', color: 'var(--presence)', f: (n) => Math.log2(Math.max(1, n)) },
  'o-n': { label: 'O(n)', color: 'var(--insight)', f: (n) => n },
  'o-nlogn': {
    label: 'O(n log n)',
    color: 'var(--warning)',
    f: (n) => n * Math.log2(Math.max(2, n)),
  },
  'o-n2': { label: 'O(n²)', color: 'var(--danger)', f: (n) => n * n },
  // The two worst classes both read as "danger", but sharing one colour left their curves, their
  // labels and their legend swatches indistinguishable. Deepen the exponential toward the page's
  // own ink so it stays the same hue — worse still looks worse — while separating cleanly, and
  // flips correctly between light and dark because it mixes against the text colour.
  'o-2n': {
    label: 'O(2ⁿ)',
    color: 'color-mix(in oklab, var(--danger) 62%, var(--text-primary))',
    f: (n) => Math.pow(2, n),
  },
};

// Drawn slowest → fastest so the steep curves render on top of the flat ones.
const DRAW_ORDER: BigOClass[] = ['o-1', 'o-logn', 'o-n', 'o-nlogn', 'o-n2', 'o-2n'];

const DEFAULT_CLASSES: BigOClass[] = ['o-1', 'o-logn', 'o-n', 'o-nlogn', 'o-n2', 'o-2n'];

export function BigO({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  classes = DEFAULT_CLASSES,
  maxN = 16,
  highlight,
  algorithm,
  xLabel = 'input size (n)',
  yLabel = 'operations',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<BigOClass | null>(null);

  const geom = useMemo(() => {
    // Keep only known classes, in canonical draw order, deduped.
    const wanted = new Set(classes.filter((c): c is BigOClass => c in CLASSES));
    const shown = DRAW_ORDER.filter((c) => wanted.has(c));

    // A small, integer input domain — Big-O is read at "small n", where the curves fan out.
    const nMax = Math.max(2, Math.min(64, Math.round(maxN)));
    const samples = nMax + 1; // n = 0..nMax inclusive
    const nAt = (i: number) => (i / nMax) * nMax; // identity, but explicit for clarity

    // Cap the y-axis at the tallest POLYNOMIAL value in view (n^2 at nMax, else the max of
    // shown non-exponential classes). The exponential is then drawn clipped — it visibly
    // rockets off the top of the plot rather than flattening everything else to zero.
    const polyClasses = shown.filter((c) => c !== 'o-2n');
    const polyTop =
      polyClasses.length > 0 ? Math.max(...polyClasses.map((c) => CLASSES[c].f(nMax))) : nMax;
    const yTop = Math.max(4, polyTop);

    const sx = scaleLinear([0, nMax], [PAD_L, W - PAD_R]);
    const sy = scaleLinear([0, yTop], [H - PAD_B, PAD_T]);

    // Build each curve's clipped polyline + the data point where its label rides.
    const curves = shown.map((c) => {
      const { f, label, color } = CLASSES[c];
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= nMax; i++) {
        const n = nAt(i);
        const yv = f(n);
        // Clip to the visible ceiling so a value past the top maps to the top edge, not
        // off-canvas (keeps the polyline inside the plot rect — no overflow).
        pts.push({ x: sx(n), y: sy(Math.min(yv, yTop)) });
      }
      // Anchor the label at the last point still inside the plot (before it clips out).
      let anchorIdx = nMax;
      for (let i = 0; i <= nMax; i++) {
        if (f(nAt(i)) > yTop) {
          anchorIdx = Math.max(0, i - 1);
          break;
        }
      }
      const anchor = pts[anchorIdx];
      return { id: c, label, color, points: pts, anchor };
    });

    // Every label wants its own curve's height, but the curves CONVERGE at the right edge — the
    // flat classes pile onto the floor and every class past the ceiling shares the clip line — so
    // the labels land on top of each other and none of them can be read. Spread them into a
    // ladder, which holds for whatever set of classes a caller asks for.
    const labelY = spreadLabels(
      curves.map((c) => ({ id: c.id, y: c.anchor.y + 3 })),
      // Gap clears a full 10px .bgo-curve-lbl line box, not just its glyphs: the card renders the
      // 340-unit viewBox around half again as wide, so a gap merely equal to the font size still
      // lets two labels' boxes touch once scaled up.
      { gap: 13, top: PAD_T + 8, bottom: H - PAD_B },
    );

    const yStep = niceStep(yTop, 4);
    const xStep = niceStep(nMax, 5);
    return {
      shown,
      curves,
      labelY,
      sx,
      sy,
      nMax,
      yTop,
      samples,
      xTicks: ticks(0, nMax, Math.max(1, Math.round(xStep))),
      yTicks: ticks(0, yTop, yStep),
    };
  }, [classes, maxN]);

  const { curves, labelY, sx, sy, nMax, yTop, xTicks, yTicks } = geom;

  // The class flagged as "this algorithm" rides on its own curve; default to the highlight.
  const algoClass: BigOClass | undefined =
    algorithm && algorithm.complexity in CLASSES ? algorithm.complexity : undefined;

  // niceDomain keeps the y-axis bound on a round number even after the cap.
  const [, niceYTop] = niceDomain(0, yTop, 4);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="bgo-wrap" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="bgo-svg" role="img" aria-label={title}>
          {/* gridlines + tick labels */}
          {xTicks.map((t) => (
            <g key={`gx${t}`}>
              <line x1={sx(t)} y1={PAD_T} x2={sx(t)} y2={H - PAD_B} className="bgo-grid" />
              <text x={sx(t)} y={H - PAD_B + 12} className="bgo-tick" textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`gy${t}`}>
              <line x1={PAD_L} y1={sy(t)} x2={W - PAD_R} y2={sy(t)} className="bgo-grid" />
              <text x={PAD_L - 5} y={sy(t) + 3} className="bgo-tick" textAnchor="end">
                {t === niceYTop || t === yTop ? `${t}+` : t}
              </text>
            </g>
          ))}

          {/* axes */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="bgo-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="bgo-axis" />

          {/* axis titles */}
          <text x={(PAD_L + W - PAD_R) / 2} y={H - 1} className="bgo-axlbl" textAnchor="middle">
            {xLabel}
          </text>
          <text
            x={0}
            y={0}
            transform={`translate(11, ${(PAD_T + H - PAD_B) / 2}) rotate(-90)`}
            className="bgo-axlbl"
            textAnchor="middle"
          >
            {yLabel}
          </text>

          {/* complexity curves (slow → fast, so steep ones layer on top) */}
          {curves.map((c) => {
            const active = hot === c.id;
            const isHi = highlight === c.id;
            const isAlgo = algoClass === c.id;
            const dim = hot !== null && !active;
            const emphasize = active || isHi || isAlgo;
            const d = c.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
            return (
              <polyline
                key={c.id}
                points={d}
                fill="none"
                stroke={c.color}
                strokeWidth={emphasize ? 3 : 1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{
                  opacity: dim ? 0.22 : isHi || isAlgo ? 1 : 0.92,
                  transition: 'opacity var(--m-fast)',
                }}
                onMouseEnter={() => setHot(c.id)}
              />
            );
          })}

          {/* inline curve labels riding the right end of each line. Start-anchored text at a
              fixed nudge past the anchor point grows RIGHTWARD, so any label longer than the
              shortest ones ("O(1)") runs past the viewBox on the classes with anchors already
              near the plot's right edge (e.g. "O(n log n)", "O(2ⁿ)"). End-anchor instead and
              park the text at a safe right-edge margin so it grows leftward, into the gutter
              PAD_R reserved for it, never past W. Vertically they sit on the de-collided
              ladder from `geom`, not on the raw curve height, so converging curves still get
              one readable label each. */}
          {curves.map((c) => {
            const isHi = highlight === c.id || algoClass === c.id;
            return (
              <text
                key={`lbl${c.id}`}
                x={W - 3}
                y={labelY.get(c.id) ?? c.anchor.y + 3}
                fill={c.color}
                className={isHi ? 'bgo-curve-lbl bgo-curve-lbl--hi' : 'bgo-curve-lbl'}
                textAnchor="end"
                style={{ opacity: hot !== null && hot !== c.id ? 0.22 : 1 }}
              >
                {c.label}
              </text>
            );
          })}

          {/* "this algorithm" callout pinned to its curve */}
          {algoClass &&
            algorithm &&
            (() => {
              const c = curves.find((cv) => cv.id === algoClass);
              if (!c) return null;
              // Mid-curve point so the callout sits on the line, not at its label.
              const mid = c.points[Math.floor(c.points.length * 0.45)];
              return (
                <g>
                  <circle cx={mid.x} cy={mid.y} r={3.4} fill={c.color} data-mark="point" />
                  <text x={mid.x} y={mid.y - 8} className="bgo-algo-lbl" textAnchor="middle">
                    {algorithm.name}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      <div className="bgo-legend">
        {curves.map((c) => {
          const on = hot === c.id;
          const flagged = highlight === c.id || algoClass === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={'bgo-leg' + (on ? ' on' : '') + (flagged ? ' flagged' : '')}
              onMouseEnter={() => setHot(c.id)}
              onMouseLeave={() => setHot(null)}
            >
              <i style={{ background: c.color }} />
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="bgo-meta">
        at n = {nMax}, an O(2&#8319;) step costs ~{Math.pow(2, nMax).toLocaleString()} ops vs {nMax}{' '}
        for O(n)
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
