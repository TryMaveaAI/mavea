import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ArgumentMapProps, PremiseType } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ArgumentMapProps & { delay?: number };

const TYPE_COLOR: Record<PremiseType, string> = {
  support: 'var(--insight)',
  objection: 'var(--warning)',
  qualifier: 'var(--text-muted)',
};

const TYPE_LABEL: Record<PremiseType, string> = {
  support: '+ For',
  objection: '− Against',
  qualifier: '~ Qualifier',
};

export function ArgumentMap({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  claim,
  premises,
  verdict,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;

  const supports = premises.filter((p) => p.type === 'support');
  const objections = premises.filter((p) => p.type === 'objection');
  const qualifiers = premises.filter((p) => p.type === 'qualifier');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Central claim */}
      <div className="am-claim">{claim}</div>

      {/* Two-column: supports vs objections */}
      <div className="am-columns">
        <div className="am-col am-col--support">
          {supports.length > 0 && (
            <div className="am-col-label" style={{ color: TYPE_COLOR.support }}>
              {TYPE_LABEL.support}
            </div>
          )}
          {supports.map((p, i) => (
            <div key={i} className="am-premise am-premise--support">
              <span className="am-premise-rail" style={{ background: TYPE_COLOR.support }} />
              <div className="am-premise-body">
                <span className="am-premise-text">{p.text}</span>
                {p.sub && <span className="am-premise-sub">{p.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="am-col am-col--objection">
          {objections.length > 0 && (
            <div className="am-col-label" style={{ color: TYPE_COLOR.objection }}>
              {TYPE_LABEL.objection}
            </div>
          )}
          {objections.map((p, i) => (
            <div key={i} className="am-premise am-premise--objection">
              <span className="am-premise-rail" style={{ background: TYPE_COLOR.objection }} />
              <div className="am-premise-body">
                <span className="am-premise-text">{p.text}</span>
                {p.sub && <span className="am-premise-sub">{p.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Qualifiers below */}
      {qualifiers.length > 0 && (
        <div className="am-qualifiers">
          <div className="am-col-label" style={{ color: TYPE_COLOR.qualifier }}>
            {TYPE_LABEL.qualifier}
          </div>
          {qualifiers.map((p, i) => (
            <div key={i} className="am-premise am-premise--qualifier">
              <span className="am-premise-rail" style={{ background: TYPE_COLOR.qualifier }} />
              <div className="am-premise-body">
                <span className="am-premise-text">{p.text}</span>
                {p.sub && <span className="am-premise-sub">{p.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {verdict && (
        <div className="am-verdict">
          <Icon.check className="ic" style={{ width: 13, height: 13 }} />
          {verdict}
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
