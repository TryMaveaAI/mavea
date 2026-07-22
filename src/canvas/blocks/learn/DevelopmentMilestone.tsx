import { type CSSProperties, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { DevelopmentMilestoneProps, MilestoneDomain } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DevelopmentMilestoneProps & { delay?: number };

const DOMAIN_LABEL: Record<MilestoneDomain, string> = {
  motor: 'Motor',
  language: 'Language',
  social: 'Social',
  cognitive: 'Cognitive',
};

const DOMAIN_COLOR: Record<MilestoneDomain, string> = {
  motor: 'var(--presence)',
  language: 'var(--insight)',
  social: 'var(--warning)',
  cognitive: 'var(--text-secondary)',
};

export function DevelopmentMilestone({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  ageLabel,
  domains,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const [activeDomain, setActiveDomain] = useState(0);

  const current = domains[activeDomain];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dm-age">{ageLabel}</div>

      <div className="dm-tabs">
        {domains.map((d, i) => (
          <button
            key={i}
            className={`dm-tab${i === activeDomain ? ' active' : ''}`}
            style={i === activeDomain ? { borderColor: DOMAIN_COLOR[d.domain] } : {}}
            onClick={() => setActiveDomain(i)}
          >
            {DOMAIN_LABEL[d.domain]}
          </button>
        ))}
      </div>

      {current && (
        <div className="dm-milestones">
          {current.milestones.map((m, i) => (
            <div key={i} className={`dm-milestone${m.achieved ? ' achieved' : ''}`}>
              <div
                className="dm-check"
                style={{ color: m.achieved ? DOMAIN_COLOR[current.domain] : 'var(--text-faint)' }}
              >
                {m.achieved ? (
                  <Icon.check className="ic" style={{ width: 14, height: 14 }} />
                ) : (
                  <span className="dm-check-empty" />
                )}
              </div>
              <div className="dm-text">
                <span className="dm-label">{m.label}</span>
                {m.note && <span className="dm-note">{m.note}</span>}
              </div>
            </div>
          ))}
        </div>
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
