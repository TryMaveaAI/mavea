import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HowToStepsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HowToStepsProps & { delay?: number };

const DIFF_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// A hands-on procedure: prep meta + an optional safety banner + the tools needed, then numbered
// steps each carrying its own caution, tip, and "done when" check. Built for physical/practical
// how-tos (repairs, setup, DIY) — recipecard owns cooking, processflow owns abstract flows.
export function HowToSteps({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  time,
  difficulty,
  warning,
  tools,
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  const safe = steps ?? [];
  const safeTools = tools ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(time || difficulty) && (
        <div className="hts-meta">
          {time && (
            <span className="hts-chip">
              <Icon.clock className="ic" style={{ width: 11, height: 11 }} /> {time}
            </span>
          )}
          {difficulty && (
            <span className={`hts-chip hts-diff hts-diff--${difficulty}`}>
              {DIFF_LABEL[difficulty] ?? difficulty}
            </span>
          )}
        </div>
      )}

      {warning && (
        <div className="hts-warning">
          <Icon.alert className="ic" />
          <span>{warning}</span>
        </div>
      )}

      {safeTools.length > 0 && (
        <div className="hts-tools">
          <span className="hts-tools-label">You&rsquo;ll need</span>
          <div className="hts-tools-chips">
            {safeTools.map((t, i) => (
              <span key={i} className="hts-tool">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <ol className="hts-steps">
        {safe.map((s, i) => (
          <li key={i} className="hts-step">
            <span className="hts-num">{i + 1}</span>
            <div className="hts-body">
              <div className="hts-action">{s.action}</div>
              {s.detail && <div className="hts-detail">{s.detail}</div>}
              {s.caution && (
                <div className="hts-caution">
                  <Icon.alert className="ic" style={{ width: 11, height: 11 }} /> {s.caution}
                </div>
              )}
              {s.tip && <div className="hts-tip">{s.tip}</div>}
              {s.check && (
                <div className="hts-check">
                  <Icon.check className="ic" style={{ width: 11, height: 11 }} /> Done when:{' '}
                  {s.check}
                </div>
              )}
            </div>
          </li>
        ))}
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
