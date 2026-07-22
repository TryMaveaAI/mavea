import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DnaBase, DnaHelixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DnaHelixProps & { delay?: number };

// Helix geometry constants
const W = 240;
const CX = W / 2;
const AMPLITUDE = 52; // max x displacement from centre
const V_STEP = 24; // vertical spacing per base pair
const PAD_T = 20;
const PAD_B = 24;
const STRAND_W = 3;

// Ladder geometry constants
const LADDER_W = 300;
const LADDER_LEFT = 60;
const LADDER_RIGHT = 240;
const LADDER_STEP = 30;
const LADDER_PAD_T = 20;

// Which base pairs are A-T vs G-C
function isAT(pair: DnaBase['pair']): boolean {
  return pair === 'AT' || pair === 'TA';
}

function leftBase(pair: DnaBase['pair']): string {
  return pair[0];
}

function rightBase(pair: DnaBase['pair']): string {
  return pair[1];
}

// Generate default base sequence when none provided
function defaultBases(count: number): DnaBase[] {
  const pairs: DnaBase['pair'][] = ['AT', 'GC', 'TA', 'CG', 'GC', 'AT', 'CG', 'TA', 'GC', 'AT'];
  return Array.from({ length: count }, (_, i) => ({ pair: pairs[i % pairs.length] }));
}

export function DnaHelix({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  bases,
  count = 10,
  mode = 'helix',
  showLabels = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  const resolvedBases = bases ?? defaultBases(Math.min(count, 16));
  const n = resolvedBases.length;

  const helixData = useMemo(() => {
    if (mode !== 'helix') return null;

    const H = PAD_T + n * V_STEP + PAD_B;
    const totalAngle = n * 1.1; // radians swept for full helix twist

    const pts1: { x: number; y: number; angle: number }[] = [];
    const pts2: { x: number; y: number; angle: number }[] = [];

    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const angle = t * totalAngle * 2 * Math.PI;
      const y = PAD_T + i * V_STEP;
      pts1.push({ x: CX + AMPLITUDE * Math.cos(angle), y, angle });
      pts2.push({ x: CX - AMPLITUDE * Math.cos(angle), y, angle });
    }

    // Find base pair positions: draw the rung when the horizontal distance is near minimum
    // i.e., when cos(angle) ≈ 0 → strands closest to centre
    const rungs: {
      x1: number;
      y: number;
      x2: number;
      base: DnaBase;
      idx: number;
    }[] = [];

    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const angle = t * totalAngle * 2 * Math.PI;
      const y = PAD_T + (i + 0.5) * V_STEP;
      const x1 = CX + AMPLITUDE * Math.cos(angle);
      const x2 = CX - AMPLITUDE * Math.cos(angle);
      rungs.push({ x1, y, x2, base: resolvedBases[i], idx: i });
    }

    return { pts1, pts2, rungs, H };
  }, [mode, n, resolvedBases]);

  const ladderData = useMemo(() => {
    if (mode !== 'ladder') return null;
    const H = LADDER_PAD_T + n * LADDER_STEP + 24;
    return { H };
  }, [mode, n]);

  const H = mode === 'helix' ? (helixData?.H ?? 240) : (ladderData?.H ?? 240);

  const polyPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dh-wrap">
        {mode === 'helix' && helixData && (
          <svg viewBox={`0 0 ${W} ${H}`} className="dh-svg" role="img" aria-label={title}>
            {/* Base pair rungs — drawn first so strands overlay them */}
            {helixData.rungs.map(({ x1, y, x2, base, idx }) => {
              const hl = base.highlight;
              const rungColor = hl
                ? 'var(--warning)'
                : isAT(base.pair)
                  ? 'var(--warning)'
                  : 'color-mix(in oklab, var(--presence) 60%, var(--insight))';
              const inFront =
                Math.cos(((idx + 0.5) / n) * helixData.rungs.length * 1.1 * 2 * Math.PI) > 0;
              if (inFront) return null; // draw in-front rungs after strands

              return (
                <g key={`rung-bg-${idx}`}>
                  <line
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    stroke={rungColor}
                    strokeWidth={hl ? 3 : 2}
                    opacity={0.7}
                    className="dh-rung"
                  />
                  {showLabels && (
                    <>
                      <text x={x1 + 6} y={y + 4} className="dh-base-label" textAnchor="start">
                        {leftBase(base.pair)}
                      </text>
                      <text x={x2 - 6} y={y + 4} className="dh-base-label" textAnchor="end">
                        {rightBase(base.pair)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Strand 1 (5'→3') */}
            <path
              d={polyPath(helixData.pts1)}
              fill="none"
              stroke="var(--presence)"
              strokeWidth={STRAND_W}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="dh-strand"
            />

            {/* Strand 2 (3'→5') */}
            <path
              d={polyPath(helixData.pts2)}
              fill="none"
              stroke="var(--insight)"
              strokeWidth={STRAND_W}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="dh-strand"
            />

            {/* In-front rungs (drawn over strands) */}
            {helixData.rungs.map(({ x1, y, x2, base, idx }) => {
              const angle = ((idx + 0.5) / n) * n * 1.1 * 2 * Math.PI;
              const inFront = Math.cos(angle) > 0;
              if (!inFront) return null;

              const hl = base.highlight;
              const rungColor = hl
                ? 'var(--warning)'
                : isAT(base.pair)
                  ? 'var(--warning)'
                  : 'color-mix(in oklab, var(--presence) 60%, var(--insight))';

              return (
                <g key={`rung-fg-${idx}`}>
                  <line
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    stroke={rungColor}
                    strokeWidth={hl ? 3 : 2}
                    className="dh-rung"
                  />
                  {showLabels && (
                    <>
                      <text x={x1 + 6} y={y + 4} className="dh-base-label" textAnchor="start">
                        {leftBase(base.pair)}
                      </text>
                      <text x={x2 - 6} y={y + 4} className="dh-base-label" textAnchor="end">
                        {rightBase(base.pair)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Direction labels */}
            <text x={16} y={14} className="dh-dir-label">
              5′
            </text>
            <text x={W - 16} y={14} className="dh-dir-label" textAnchor="end">
              3′
            </text>
            <text x={16} y={H - 8} className="dh-dir-label">
              3′
            </text>
            <text x={W - 16} y={H - 8} className="dh-dir-label" textAnchor="end">
              5′
            </text>
          </svg>
        )}

        {mode === 'ladder' && ladderData && (
          <svg
            viewBox={`0 0 ${LADDER_W} ${ladderData.H}`}
            className="dh-svg"
            role="img"
            aria-label={title}
          >
            {/* Left backbone (5'→3') */}
            <line
              x1={LADDER_LEFT}
              y1={LADDER_PAD_T}
              x2={LADDER_LEFT}
              y2={LADDER_PAD_T + n * LADDER_STEP}
              stroke="var(--presence)"
              strokeWidth={4}
              strokeLinecap="round"
              className="dh-strand"
            />
            {/* Right backbone (3'→5') */}
            <line
              x1={LADDER_RIGHT}
              y1={LADDER_PAD_T}
              x2={LADDER_RIGHT}
              y2={LADDER_PAD_T + n * LADDER_STEP}
              stroke="var(--insight)"
              strokeWidth={4}
              strokeLinecap="round"
              className="dh-strand"
            />

            {/* Rungs */}
            {resolvedBases.map((base, i) => {
              const y = LADDER_PAD_T + (i + 0.5) * LADDER_STEP;
              const hl = base.highlight;
              const rungColor = hl
                ? 'var(--warning)'
                : isAT(base.pair)
                  ? 'var(--warning)'
                  : 'color-mix(in oklab, var(--presence) 60%, var(--insight))';

              return (
                <g key={i}>
                  <line
                    x1={LADDER_LEFT}
                    y1={y}
                    x2={LADDER_RIGHT}
                    y2={y}
                    stroke={rungColor}
                    strokeWidth={hl ? 3 : 2}
                    className="dh-rung"
                  />
                  {showLabels && (
                    <>
                      <text
                        x={LADDER_LEFT + 8}
                        y={y + 4}
                        className="dh-base-label"
                        textAnchor="start"
                      >
                        {leftBase(base.pair)}
                      </text>
                      <text
                        x={(LADDER_LEFT + LADDER_RIGHT) / 2}
                        y={y + 4}
                        className="dh-pair-dash"
                        textAnchor="middle"
                      >
                        —
                      </text>
                      <text
                        x={LADDER_RIGHT - 8}
                        y={y + 4}
                        className="dh-base-label"
                        textAnchor="end"
                      >
                        {rightBase(base.pair)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Direction labels */}
            <text
              x={LADDER_LEFT - 4}
              y={LADDER_PAD_T - 6}
              className="dh-dir-label"
              textAnchor="middle"
            >
              5′
            </text>
            <text
              x={LADDER_RIGHT + 4}
              y={LADDER_PAD_T - 6}
              className="dh-dir-label"
              textAnchor="middle"
            >
              3′
            </text>
            <text
              x={LADDER_LEFT - 4}
              y={LADDER_PAD_T + n * LADDER_STEP + 14}
              className="dh-dir-label"
              textAnchor="middle"
            >
              3′
            </text>
            <text
              x={LADDER_RIGHT + 4}
              y={LADDER_PAD_T + n * LADDER_STEP + 14}
              className="dh-dir-label"
              textAnchor="middle"
            >
              5′
            </text>
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="dh-legend">
        <span className="dh-legend-dot dh-legend-at" /> A–T
        <span className="dh-legend-dot dh-legend-gc" style={{ marginLeft: 12 }} /> G–C
      </div>

      {caption && <p className="dh-caption">{caption}</p>}

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
