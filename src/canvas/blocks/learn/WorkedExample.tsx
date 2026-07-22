import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { MathML } from './mathml';
import type { WorkedExampleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WorkedExampleProps & { delay?: number };

export function WorkedExample({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  problem,
  steps,
  result,
  progressive = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // In progressive mode, reveal one step at a time; otherwise show them all.
  const [shown, setShown] = useState(progressive ? 1 : steps.length);
  const allShown = shown >= steps.length;
  const resultVisible = allShown;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {problem && (
        <div className="lr-wx-problem" dangerouslySetInnerHTML={richInnerHtml(problem)} />
      )}

      <ol className="lr-wx-steps">
        {steps.slice(0, shown).map((s, i) => (
          <li className="lr-wx-step" key={i}>
            <span className="lr-wx-num">{i + 1}</span>
            <div className="lr-wx-body">
              <div className="lr-wx-label">{s.label}</div>
              {s.math && (
                <div className="lr-wx-math">
                  <MathML node={s.math} display label={s.label} />
                </div>
              )}
              {s.why && (
                <div className="lr-wx-why" dangerouslySetInnerHTML={richInnerHtml(s.why)} />
              )}
            </div>
          </li>
        ))}
      </ol>

      {progressive && !allShown && (
        <button
          className="mini-btn lr-wx-next"
          onClick={() => setShown((n) => Math.min(steps.length, n + 1))}
        >
          <Icon.arrowDown /> Next step ({shown}/{steps.length})
        </button>
      )}

      {result && resultVisible && (
        // The final answer is the pinnacle datum of the worked solution; the gesture underlines it.
        <div className="lr-wx-result" data-mark="underline">
          <span className="lr-wx-result-tag">Answer</span>
          <MathML node={result} display label="answer" />
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
