import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScenariosetProps, ScenarioKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScenariosetProps & { delay?: number };

// Outcome flavor → accent + default label. best is upside, likely is the base case, worst
// is downside — three columns so a decision's range is visible at once, not buried in prose.
const KIND: Record<ScenarioKind, { color: string; label: string }> = {
  best: { color: 'var(--insight)', label: 'Best case' },
  likely: { color: 'var(--presence)', label: 'Likely' },
  worst: { color: 'var(--danger)', label: 'Worst case' },
};

/**
 * Best / likely / worst outcomes side by side, with the base case emphasized. Turns "it
 * depends" into a visible range — the spread a person actually weighs when the future is
 * uncertain, shown without faking a single precise number.
 */
export function Scenarioset({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  metric,
  scenarios,
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // Emphasize the explicit highlight, else the 'likely' panel, else nothing.
  const hi = highlight ?? scenarios.findIndex((s) => s.kind === 'likely');

  return (
    <div
      className="card reveal lay-scenarios"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {metric && <div className="lay-sc-metric faint">{metric}</div>}

      <div className="lay-sc-grid">
        {scenarios.map((s, i) => {
          // A model may emit a kind outside best/likely/worst — fall back rather than throw.
          const km = s.kind ? KIND[s.kind] : undefined;
          const k = km ?? { color: 'var(--text-muted)', label: s.label || 'Scenario' };
          return (
            <div
              key={i}
              className={`lay-sc-panel ${i === hi ? 'hi' : ''}`}
              style={{ ['--sc' as string]: k.color } as CSSProperties}
            >
              <span className="lay-sc-bar" />
              <span className="lay-sc-label">{s.label || k.label}</span>
              <span className="lay-sc-value">{s.value}</span>
              {s.detail && (
                <span
                  className="lay-sc-detail faint"
                  dangerouslySetInnerHTML={richInnerHtml(s.detail)}
                />
              )}
              {s.points && s.points.length > 0 && (
                <ul className="lay-sc-points">
                  {s.points.map((p, j) => (
                    <li key={j}>
                      <span className="lay-sc-pt-dot" />
                      <span dangerouslySetInnerHTML={richInnerHtml(p)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
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
