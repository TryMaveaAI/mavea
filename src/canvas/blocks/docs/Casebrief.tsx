import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CasebriefProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CasebriefProps & { delay?: number };

const SECTIONS: { key: 'facts' | 'issue' | 'holding' | 'reasoning'; label: string }[] = [
  { key: 'facts', label: 'Facts' },
  { key: 'issue', label: 'Issue' },
  { key: 'holding', label: 'Holding' },
  { key: 'reasoning', label: 'Reasoning' },
];

export function Casebrief({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  citation,
  parties,
  facts,
  issue,
  holding,
  reasoning,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const body = { facts, issue, holding, reasoning };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {citation && <div className="cb-citation">{citation}</div>}

      <div className="cb-parties">
        <span className="cb-party">{parties.plaintiff}</span>
        <span className="cb-vs">v.</span>
        <span className="cb-party">{parties.defendant}</span>
      </div>

      {SECTIONS.map((s, i) => (
        <section
          key={s.key}
          className={`cb-section cb-section--${s.key} m-stagger-item m-fade-rise`}
          style={{ ['--i' as string]: i } as CSSProperties}
        >
          <div className="cb-section-label">{s.label}</div>
          <div className="cb-section-body">{body[s.key]}</div>
        </section>
      ))}

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
