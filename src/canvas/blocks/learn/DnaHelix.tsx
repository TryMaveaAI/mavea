import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DnaBase, DnaHelixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { HELIX_W, helixGeometry, runPath } from './dnaHelixLayout';

type Props = DnaHelixProps & { delay?: number };

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

function rungColor(base: DnaBase): string {
  return base.highlight || isAT(base.pair)
    ? 'var(--warning)'
    : 'color-mix(in oklab, var(--presence) 60%, var(--insight))';
}

const strandColor = (strand: 1 | 2) => (strand === 1 ? 'var(--presence)' : 'var(--insight)');

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

  const helixData = useMemo(() => (mode === 'helix' ? helixGeometry(n) : null), [mode, n]);

  const ladderData = useMemo(() => {
    if (mode !== 'ladder') return null;
    const H = LADDER_PAD_T + n * LADDER_STEP + 24;
    return { H };
  }, [mode, n]);

  const H = mode === 'helix' ? (helixData?.height ?? 240) : (ladderData?.H ?? 240);

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
          <svg viewBox={`0 0 ${HELIX_W} ${H}`} className="dh-svg" role="img" aria-label={title}>
            {/* Back to front: the far stretches of both strands, the rungs between them, then the
                near stretches, so each crossover shows which strand passes in front. */}
            {helixData.back.map((run, k) => (
              <path
                key={`back-${k}`}
                d={runPath(run.points)}
                stroke={strandColor(run.strand)}
                strokeWidth={STRAND_W}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.7}
                className="dh-strand"
              />
            ))}
            {helixData.rungs.map(({ idx, y, x1, x2 }) => {
              const base = resolvedBases[idx];
              return (
                <line
                  key={`rung-${idx}`}
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke={rungColor(base)}
                  strokeWidth={base.highlight ? 3 : 2}
                  className="dh-rung"
                />
              );
            })}
            {helixData.front.map((run, k) => (
              <path
                key={`front-${k}`}
                d={runPath(run.points)}
                stroke={strandColor(run.strand)}
                strokeWidth={STRAND_W}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="dh-strand"
              />
            ))}
            {showLabels &&
              helixData.rungs.map(({ idx, y, base1, base2 }) => {
                const pair = resolvedBases[idx].pair;
                return (
                  <g key={`bases-${idx}`}>
                    <text
                      x={base1.x}
                      y={y}
                      className="dh-base-label"
                      textAnchor={base1.anchor}
                      dominantBaseline="central"
                    >
                      {leftBase(pair)}
                    </text>
                    <text
                      x={base2.x}
                      y={y}
                      className="dh-base-label"
                      textAnchor={base2.anchor}
                      dominantBaseline="central"
                    >
                      {rightBase(pair)}
                    </text>
                  </g>
                );
              })}

            {/* Direction labels */}
            <text x={16} y={14} className="dh-dir-label">
              5′
            </text>
            <text x={HELIX_W - 16} y={14} className="dh-dir-label" textAnchor="end">
              3′
            </text>
            <text x={16} y={H - 8} className="dh-dir-label">
              3′
            </text>
            <text x={HELIX_W - 16} y={H - 8} className="dh-dir-label" textAnchor="end">
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

              return (
                <g key={i}>
                  <line
                    x1={LADDER_LEFT}
                    y1={y}
                    x2={LADDER_RIGHT}
                    y2={y}
                    stroke={rungColor(base)}
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
