// CVSS severity scorecard — a big radial gauge for the 0–10 base score, colored by severity
// band, beside a compact metric-chip row for the vector's individual components. The dial
// reuses canvas/Gauge's own arc technique verbatim (a circle normalized via pathLength=1, so
// strokeDashoffset reads as a plain 0..1 fraction) rather than a fresh implementation, and its
// existing global classes (.gauge-host/.gauge-arc/.gauge-center/...) so it looks like the same
// dial everywhere it appears — just re-colored per severity instead of the plain warning/insight
// split Gauge itself uses.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useCountUp } from '../../lib/motion';
import type { CvssscorecardProps, CvssSeverity, CvssVectorComponent } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CvssscorecardProps & { delay?: number };

const SEVERITIES: readonly CvssSeverity[] = ['none', 'low', 'medium', 'high', 'critical'];

function severityColor(sev: CvssSeverity): string {
  switch (sev) {
    case 'critical':
    case 'high':
      return 'var(--danger)';
    case 'medium':
      return 'var(--warning)';
    case 'low':
      return 'var(--insight)';
    default:
      return 'var(--text-muted)';
  }
}

/** The official CVSS v3.1 qualitative rating scale — used only as a fallback when the caller's
 *  `severity` is missing or not one of the five known bands, so the dial still colors sensibly
 *  from a real number rather than defaulting to a meaningless gray. */
function deriveSeverity(score: number): CvssSeverity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

const SIZE = 132;
const R = SIZE / 2 - 11;

export function CvssScorecard({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  baseScore,
  severity,
  vector,
  cve,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const hasScore = typeof baseScore === 'number' && Number.isFinite(baseScore);
  const clamped = hasScore ? Math.max(0, Math.min(10, baseScore)) : 0;
  const sev = SEVERITIES.includes(severity) ? severity : deriveSeverity(clamped);
  const color = severityColor(sev);
  const frac = clamped / 10;

  const scoreText = useCountUp(hasScore ? clamped : 0, {
    delay: (delay || 0) + 120,
    decimals: 1,
  });

  const chips = (Array.isArray(vector) ? vector : [])
    .filter(
      (v): v is CvssVectorComponent =>
        !!v &&
        typeof v.label === 'string' &&
        v.label.trim() !== '' &&
        typeof v.value === 'string' &&
        v.value.trim() !== '',
    )
    .slice(0, 12); // a CVSS vector has at most a handful of metrics; guard against a runaway list

  const cveText = typeof cve === 'string' && cve.trim() ? cve.trim() : null;

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {cveText && <span className="cvss-cve">{cveText}</span>}
      </div>

      <div className="cvss-body">
        <div className="gauge-host" style={{ width: SIZE, height: SIZE }}>
          <svg className="gauge" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="var(--surface-glass-strong)"
              strokeWidth="10"
            />
            {hasScore && (
              <circle
                className="gauge-arc"
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - frac}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            )}
          </svg>
          <div className="gauge-center">
            <div
              className="gauge-num tab-num"
              data-mark={hasScore ? 'underline' : undefined}
              style={{ color }}
            >
              {hasScore ? scoreText : '—'}
            </div>
            <div className="gauge-band" style={{ color }}>
              {sev}
            </div>
          </div>
        </div>

        <div className="cvss-side">
          {chips.length > 0 ? (
            <div className="cvss-chips">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className="cvss-chip m-fade-rise m-stagger-item"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <span className="cvss-chip-k">{c.label}</span>
                  <span className="cvss-chip-v">{c.value}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="faint" style={{ fontSize: 13, margin: 0 }}>
              {hasScore ? 'No vector components supplied.' : 'Provide a base score 0–10.'}
            </p>
          )}
        </div>
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
