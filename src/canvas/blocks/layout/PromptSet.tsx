import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PromptSetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PromptSetProps & { delay?: number };

// A calm set of open reflection prompts — each an open question with a gentle guidance line, grouped
// under an optional theme. Deliberately low-chrome: no checkboxes, no scoring, nothing to "complete".
// It invites thinking rather than tracking a task, which separates it from a checklist or a quiz.
export function PromptSet({
  title = 'A few things to sit with',
  icon = 'edit',
  iconColor = 'var(--presence)',
  theme,
  prompts,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const list = prompts ?? [];

  return (
    <div
      className="card reveal lay-ps"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {theme && (
        <div className="lay-ps-theme">
          <span className="lay-ps-theme-dot" aria-hidden="true" />
          {theme}
        </div>
      )}

      <ol className="lay-ps-list">
        {list.map((p, i) => (
          <li className="lay-ps-card" key={i}>
            <span className="lay-ps-mark tab-num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="lay-ps-body">
              <p className="lay-ps-q">{p.question}</p>
              {p.guidance && <p className="lay-ps-guide">{p.guidance}</p>}
            </div>
          </li>
        ))}
      </ol>

      {caption && <div className="lay-ps-caption faint">{caption}</div>}

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
