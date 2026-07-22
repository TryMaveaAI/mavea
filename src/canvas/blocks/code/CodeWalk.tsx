import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CodeWalkProps, CodeWalkStep } from './types';
import './styles.css';
import { richInnerHtml } from '../../../lib/richText';

type Props = CodeWalkProps & { delay?: number };

// A code-walk step is intentionally illustrative, not an executable program. Individual steps
// normally depend on setup or state from earlier/later steps, so presenting them as independently
// runnable creates a fake demo and predictable ReferenceErrors. Standalone codeblocks own running.
function StepCodePanel({ step }: { step: CodeWalkStep }) {
  if (!step.code) return null;

  return <pre className="cw-code">{step.code}</pre>;
}

// Renders a step-by-step algorithm walkthrough as a vertical timeline.
// Each step gets a circular presence-tinted badge, a title, explanation text,
// and an optional code snippet block. The left-side connecting line is drawn
// by a pseudo-element on .cw-steps so individual steps stay uncoupled from
// the layout geometry.
export function CodeWalk({
  title,
  icon = 'doc',
  iconColor,
  algorithm,
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const resolvedIconColor = iconColor ?? 'var(--presence)';
  const stepList = steps ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: resolvedIconColor }} /> {title}
      </div>

      {algorithm && <div className="cw-algo">{algorithm}</div>}

      <div className="cw-steps">
        {stepList.map((s) => (
          <div key={s.step} className="cw-step">
            <div className="cw-num">{s.step}</div>
            <div className="cw-body">
              <div className="cw-step-title">{s.title}</div>
              <StepCodePanel step={s} />
              <div className="cw-exp">{s.explanation}</div>
            </div>
          </div>
        ))}
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
