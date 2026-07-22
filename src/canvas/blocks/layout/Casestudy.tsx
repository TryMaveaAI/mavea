import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CasestudyProps, CaseSection } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CasestudyProps & { delay?: number };
type StageKey = 'setup' | 'action' | 'result' | 'lesson';

const STAGES: { key: StageKey; label: string; icon: keyof typeof Icon; color: string }[] = [
  { key: 'setup', label: 'Setup', icon: 'doc', color: 'var(--text-muted)' },
  { key: 'action', label: 'Action', icon: 'play', color: 'var(--presence)' },
  { key: 'result', label: 'Result', icon: 'chart', color: 'var(--insight)' },
  { key: 'lesson', label: 'Lesson', icon: 'spark', color: 'var(--warning)' },
];

export function Casestudy({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  subject,
  setup,
  action,
  result,
  lesson,
  defaultStage = 'result',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;
  const sections: Record<StageKey, CaseSection> = { setup, action, result, lesson };
  const [open, setOpen] = useState<StageKey>(defaultStage);

  return (
    <div
      className="card reveal lay-cs"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lay-cs-subject">{subject}</div>

      <div className="lay-cs-stages">
        {STAGES.map((s, i) => {
          const sec = sections[s.key];
          const SIc = Icon[s.icon];
          const isOpen = open === s.key;
          return (
            <div
              key={s.key}
              className={`lay-cs-stage ${isOpen ? 'open' : ''}`}
              style={{ ['--st' as string]: s.color } as CSSProperties}
            >
              <button
                type="button"
                className="lay-cs-head"
                onClick={() => setOpen(s.key)}
                aria-expanded={isOpen}
              >
                <span className="lay-cs-rail">
                  <span className="lay-cs-node">
                    <SIc className="ic" />
                  </span>
                  {i < STAGES.length - 1 && <span className="lay-cs-line" />}
                </span>
                <span className="lay-cs-label">{s.label}</span>
                {sec.metric && <span className="lay-cs-metric tab-num">{sec.metric}</span>}
                <Icon.chevR
                  className="ic lay-chev"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                />
              </button>
              <div className={`lay-cs-body ${isOpen ? 'open' : ''}`}>
                <div
                  className="lay-cs-body-inner"
                  dangerouslySetInnerHTML={richInnerHtml(sec.body)}
                />
              </div>
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
