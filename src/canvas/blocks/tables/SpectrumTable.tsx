import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { SpectrumTableProps, SpectrumTechnique } from './types';
import { richInnerHtml } from '../../../lib/richText';

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
// shows m/z/relative-abundance/fragment — with an optional tick-marked axis strip above it.
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
          <div
            className="spt-axis"
            role="img"
            aria-label={`${meta.name} axis from ${fmtX(meta.descending ? hi : lo, 0)} to ${fmtX(meta.descending ? lo : hi, 0)} ${meta.xHeader}`}
          >
            <div className="spt-axis-line" />
            {sorted.map((p, i) => {
              const t = (p.x - lo) / span;
              const pct = clampPct((meta.descending ? 1 - t : t) * 100);
              return <div key={i} className="spt-tick" style={{ left: `${pct}%` }} />;
            })}
            <span className="spt-axis-end spt-axis-lo">{fmtX(meta.descending ? hi : lo, 0)}</span>
            <span className="spt-axis-end spt-axis-hi">{fmtX(meta.descending ? lo : hi, 0)}</span>
          </div>

          <div className="spt-scroll">
            <div className="spt-grid" style={{ gridTemplateColumns: gridCols }} role="grid">
              <div className="spt-colh" role="columnheader">
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
