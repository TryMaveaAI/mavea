import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RiskMatrixProps, Risk } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RiskMatrixProps & { delay?: number };

/** Clamp a 1..N score into the grid; loose model output (0, 6, 2.5) lands in a real cell. */
const clamp = (v: number, n: number) => Math.max(1, Math.min(n, Math.round(v)));

/**
 * RAG band for a cell from its likelihood×impact product on a 1..N grid. The thresholds are the
 * fraction of the maximum product (N²), so a 3×3 and a 5×5 grid both band low→green, mid→amber,
 * high→red the way a standard risk heat map reads.
 */
function band(likelihood: number, impact: number, n: number): 'low' | 'med' | 'high' {
  const t = (likelihood * impact) / (n * n);
  if (t >= 0.55) return 'high';
  if (t >= 0.28) return 'med';
  return 'low';
}
const BAND_COLOR: Record<'low' | 'med' | 'high', string> = {
  low: 'var(--insight)',
  med: 'var(--warning)',
  high: 'var(--danger)',
};

export function RiskMatrix({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  risks,
  size = 5,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const n = size;
  const [hot, setHot] = useState<number | null>(null);

  // Place each risk in its (likelihood, impact) cell; several risks can share one cell, so we
  // bucket by cell key and let the chips stack inside it.
  const placed: Risk[] = risks.map((r) => ({
    ...r,
    likelihood: clamp(r.likelihood, n),
    impact: clamp(r.impact, n),
  }));
  const cellRisks = (l: number, i: number) =>
    placed.map((r, idx) => ({ r, idx })).filter(({ r }) => r.likelihood === l && r.impact === i);

  // Rows run high→low likelihood (top is most likely); columns run low→high impact (right is worst).
  const rows = Array.from({ length: n }, (_, k) => n - k);
  const colsAxis = Array.from({ length: n }, (_, k) => k + 1);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow" style={{ marginBottom: caption ? 4 : 14 }}>
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {caption && <div className="fs-cap">{caption}</div>}

      <div className="rm-plot">
        <div className="rm-ylabel">Likelihood</div>
        <div className="rm-grid-wrap">
          <div className="rm-grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {rows.map((l) =>
              colsAxis.map((i) => {
                const b = band(l, i, n);
                const c = BAND_COLOR[b];
                const here = cellRisks(l, i);
                return (
                  <div
                    key={`${l}-${i}`}
                    className={`rm-cell rm-${b}`}
                    style={{
                      background: `color-mix(in oklab, ${c} 16%, transparent)`,
                      borderColor: `color-mix(in oklab, ${c} 30%, transparent)`,
                    }}
                  >
                    {here.map(({ r, idx }) => (
                      <span
                        key={idx}
                        className={`rm-chip ${hot === idx ? 'hot' : ''}`}
                        style={{
                          background: `color-mix(in oklab, ${c} 26%, var(--surface-elevated))`,
                          borderColor: c,
                        }}
                        onMouseEnter={() => setHot(idx)}
                        onMouseLeave={() => setHot(null)}
                      >
                        {r.label}
                      </span>
                    ))}
                  </div>
                );
              }),
            )}
          </div>
          <div className="rm-xlabel">Impact →</div>
        </div>
      </div>

      <ol className="rm-register">
        {placed.map((r, idx) => {
          const b = band(r.likelihood, r.impact, n);
          const c = BAND_COLOR[b];
          return (
            <li
              key={idx}
              className={`rm-reg-row ${hot === idx ? 'hot' : ''}`}
              onMouseEnter={() => setHot(idx)}
              onMouseLeave={() => setHot(null)}
            >
              <span className="rm-reg-dot" style={{ background: c }} />
              <div className="rm-reg-body">
                <div className="rm-reg-top">
                  <span className="rm-reg-label">{r.label}</span>
                  {r.owner && <span className="rm-reg-owner">{r.owner}</span>}
                </div>
                {r.mitigation && <div className="rm-reg-mit">{r.mitigation}</div>}
              </div>
            </li>
          );
        })}
      </ol>

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
