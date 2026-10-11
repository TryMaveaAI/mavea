import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { SpectrumTableProps, SpectrumTechnique } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';
import { placePeakLabels, scaleTicks } from './spectrumAxis';

type Props = SpectrumTableProps & { delay?: number };

interface TechMeta {
  name: string;
  xHeader: string;
  xDecimals: number;
  /** NMR shows multiplicity + integration in place of the IR/MS intensity bar. */
  showMultInteg: boolean;
  intensityLabel: string;
  assignLabel: string;
  /** the textbook axis range; extended to fit any peak that falls outside it. */
  domain: [number, number];
  /** left-to-right reading direction — high→low for NMR/IR (convention), low→high for MS. */
  descending: boolean;
}

const TECH: Record<SpectrumTechnique, TechMeta> = {
  'nmr-1h': {
    name: '¹H NMR',
    xHeader: 'δ (ppm)',
    xDecimals: 2,
    showMultInteg: true,
    intensityLabel: 'Intensity',
    assignLabel: 'Assignment',
    domain: [0, 12],
    descending: true,
  },
  'nmr-13c': {
    name: '¹³C NMR',
    xHeader: 'δ (ppm)',
    xDecimals: 1,
    showMultInteg: true,
    intensityLabel: 'Intensity',
    assignLabel: 'Assignment',
    domain: [0, 220],
    descending: true,
  },
  ir: {
    name: 'IR',
    xHeader: 'cm⁻¹',
    xDecimals: 0,
    showMultInteg: false,
    intensityLabel: 'Intensity',
    assignLabel: 'Functional group',
    domain: [400, 4000],
    descending: true,
  },
  ms: {
    name: 'MS',
    xHeader: 'm/z',
    xDecimals: 0,
    showMultInteg: false,
    intensityLabel: 'Rel. abundance',
    assignLabel: 'Fragment',
    domain: [0, 100],
    descending: false,
  },
};

const FALLBACK_AXIS_W = 600;
const AXIS_PAD = 12;
const PEAK_FS = 10.5; // .spt-peak-label
const PEAK_ROW_H = 14;
const STICK_MAX = 30;
const STICK_MIN = 6;

function toTechnique(v: unknown): SpectrumTechnique {
  return v === 'nmr-1h' || v === 'nmr-13c' || v === 'ir' || v === 'ms' ? v : 'nmr-1h';
}

/** Loose model output → a real finite number, or null (never NaN reaching a render). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fmtX(x: number, decimals: number): string {
  return Number.isFinite(x) ? x.toFixed(decimals) : '—';
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// A spectroscopy peak-interpretation table whose columns switch by technique — NMR shows
// shift/multiplicity/integration/assignment, IR shows wavenumber/intensity/functional-group, MS
// shows m/z/relative-abundance/fragment — with a stick spectrum of the same peaks above it.
// Chemistry, analytical/organic-chemistry coursework — "read this spectrum".
export function SpectrumTable({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  technique,
  compound,
  solvent,
  peaks,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [axisRef, axisWidth] = useHostWidth<HTMLDivElement>();
  const meta = TECH[toTechnique(technique)];

  const valid = (Array.isArray(peaks) ? peaks : []).filter((p) => num(p?.x) != null);
  const sorted = [...valid].sort((a, b) => (meta.descending ? b.x - a.x : a.x - b.x));

  const xs = valid.map((p) => p.x);
  const lo = xs.length ? Math.min(meta.domain[0], ...xs) : meta.domain[0];
  const hi = xs.length ? Math.max(meta.domain[1], ...xs) : meta.domain[1];
  const span = hi - lo || 1;

  const capParts = [meta.name, compound, solvent].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );

  // The strip above the table: one stick per peak, as tall as its share of the strongest
  // (integration for NMR, intensity for IR/MS), its shift printed above it, and a round scale
  // along the bottom so the sticks can be read without the table.
  const axisW = axisWidth > 0 ? axisWidth : FALLBACK_AXIS_W;
  const axisX = (v: number) =>
    AXIS_PAD + ((meta.descending ? hi - v : v - lo) / span) * (axisW - AXIS_PAD * 2);
  const strengths = sorted.map((p) => num(meta.showMultInteg ? p.integration : p.intensity));
  const strongest = Math.max(0, ...strengths.map((v) => v ?? 0));
  const peakLabels = sorted.map((p) => fmtX(p.x, meta.xDecimals));
  const placed = placePeakLabels(
    sorted.map((p) => axisX(p.x)),
    peakLabels.map((l) => estimateTextWidth(l, PEAK_FS, true)),
    0,
    axisW,
  );
  const rows = placed[0]?.rows ?? 1;
  const stickTop = rows * PEAK_ROW_H + 6;
  const base = stickTop + STICK_MAX;
  const axis = {
    w: axisW,
    h: base + 20,
    base,
    ticks: scaleTicks(lo, hi, axisW - AXIS_PAD * 2, 60).map((v) => ({
      v,
      x: axisX(v),
      label: String(v),
    })),
    peaks: sorted.map((p, i) => {
      const share = strongest > 0 && strengths[i] != null ? strengths[i]! / strongest : 0.7;
      return {
        x: axisX(p.x),
        top: base - Math.max(STICK_MIN, share * STICK_MAX),
        lx: placed[i].x,
        ly: (placed[i].row + 1) * PEAK_ROW_H - 2,
        label: peakLabels[i],
      };
    }),
  };

  const gridCols = meta.showMultInteg
    ? 'minmax(64px, 0.7fr) minmax(56px, 0.55fr) minmax(56px, 0.55fr) minmax(120px, 2fr)'
    : 'minmax(72px, 0.7fr) minmax(110px, 1.1fr) minmax(120px, 2fr)';

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="spt-cap">{capParts.join(' · ')}</div>

      {sorted.length === 0 ? (
        <BlockEmpty message="No peaks to show" />
      ) : (
        <>
          <div ref={axisRef} className="spt-axis">
            <svg
              viewBox={`0 0 ${axis.w} ${axis.h}`}
              role="img"
              aria-label={`${meta.name} peaks at ${sorted.map((p) => fmtX(p.x, meta.xDecimals)).join(', ')} ${meta.xHeader}`}
            >
              <line
                className="spt-axis-line"
                x1={AXIS_PAD}
                x2={axis.w - AXIS_PAD}
                y1={axis.base}
                y2={axis.base}
              />
              {axis.ticks.map((t) => (
                <g key={t.v}>
                  <line
                    className="spt-scale-tick"
                    x1={t.x}
                    x2={t.x}
                    y1={axis.base}
                    y2={axis.base + 4}
                  />
                  <text className="spt-scale-label" x={t.x} y={axis.base + 15} textAnchor="middle">
                    {t.label}
                  </text>
                </g>
              ))}
              {axis.peaks.map((pk, i) => (
                <g key={i}>
                  <line className="spt-stick" x1={pk.x} x2={pk.x} y1={axis.base} y2={pk.top} />
                  <line
                    className="spt-leader"
                    x1={pk.x}
                    x2={pk.lx}
                    y1={pk.top - 2}
                    y2={pk.ly + 3}
                  />
                  <text className="spt-peak-label" x={pk.lx} y={pk.ly} textAnchor="middle">
                    {pk.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="spt-scroll">
            <div className="spt-grid" style={{ gridTemplateColumns: gridCols }} role="grid">
              <div className="spt-colh spt-colh-unit" role="columnheader">
                {meta.xHeader}
              </div>
              {meta.showMultInteg ? (
                <>
                  <div className="spt-colh" role="columnheader">
                    Mult.
                  </div>
                  <div className="spt-colh" role="columnheader">
                    Integ.
                  </div>
                </>
              ) : (
                <div className="spt-colh" role="columnheader">
                  {meta.intensityLabel}
                </div>
              )}
              <div className="spt-colh spt-colh-assign" role="columnheader">
                {meta.assignLabel}
              </div>

              {sorted.map((p, i) => {
                const integ = num(p.integration);
                const inten = num(p.intensity);
                return (
                  <div
                    key={i}
                    className="spt-row m-stagger-item m-fade-rise"
                    style={{ ['--i' as string]: i } as CSSProperties}
                    role="row"
                  >
                    <div className="spt-x tab-num" role="gridcell">
                      {fmtX(p.x, meta.xDecimals)}
                    </div>
                    {meta.showMultInteg ? (
                      <>
                        <div className="spt-mult" role="gridcell">
                          {p.multiplicity || '—'}
                        </div>
                        <div className="spt-integ tab-num" role="gridcell">
                          {integ != null
                            ? `${integ}${toTechnique(technique) === 'nmr-1h' ? 'H' : ''}`
                            : '—'}
                        </div>
                      </>
                    ) : (
                      <div className="spt-intensity" role="gridcell">
                        {inten != null ? (
                          <>
                            <div className="spt-int-track">
                              <div
                                className="spt-int-fill"
                                style={{ width: `${clampPct(inten)}%` }}
                              />
                            </div>
                            <span className="spt-int-pct tab-num">
                              {Math.round(clampPct(inten))}%
                            </span>
                          </>
                        ) : (
                          <span className="spt-dash">—</span>
                        )}
                      </div>
                    )}
                    <div className="spt-assign" role="gridcell">
                      {p.assignment || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

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
