import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VerdictcardProps, VerdictStance, VerdictConfidence } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VerdictcardProps & { delay?: number };

// Stance → badge word, badge icon, and accent token. yes reads as good, no as danger,
// maybe/caution as caution — so the verdict's color carries its meaning at a glance.
const STANCE: Record<VerdictStance, { color: string; label: string; icon: keyof typeof Icon }> = {
  yes: { color: 'var(--insight)', label: 'Yes', icon: 'check' },
  no: { color: 'var(--danger)', label: 'No', icon: 'x' },
  maybe: { color: 'var(--warning)', label: 'Maybe', icon: 'alert' },
  caution: { color: 'var(--warning)', label: 'Be careful', icon: 'alert' },
};

const CONF_LABEL: Record<VerdictConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};
const CONF_DOTS: Record<VerdictConfidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * The opening "what's the call" card. A stance badge + a bold one-line verdict, then the
 * single reason behind it and the honest caveat that keeps it trustworthy. Built for the
 * top of a decision answer — it says the answer plainly before the canvas justifies it.
 */
export function Verdictcard({
  title,
  icon,
  iconColor,
  verdict,
  stance = 'maybe',
  label,
  reason,
  caveat,
  confidence,
  footer,
  delay,
}: Props) {
  const st = STANCE[stance] ?? STANCE.maybe;
  const EyebrowIcon = Icon[icon ?? st.icon] || Icon.spark;
  const BadgeIcon = Icon[st.icon] || Icon.check;

  return (
    <div
      className="card reveal lay-verdict"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--vc' as string]: st.color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <EyebrowIcon className="ic" style={{ color: iconColor || st.color }} /> {title}
      </div>

      <div className="lay-vd-head">
        <span className="lay-vd-badge">
          <BadgeIcon className="ic lay-vd-badge-ic" />
          {label || st.label}
        </span>
        {confidence && (
          <span className="lay-vd-conf">
            <span className="lay-vd-dots" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`lay-vd-dot ${i < CONF_DOTS[confidence] ? 'on' : ''}`} />
              ))}
            </span>
            {CONF_LABEL[confidence]}
          </span>
        )}
      </div>

      <div className="lay-vd-verdict" dangerouslySetInnerHTML={richInnerHtml(verdict)} />

      {reason && (
        <div className="lay-vd-reason">
          <span className="lay-vd-tag">Why</span>
          <span dangerouslySetInnerHTML={richInnerHtml(reason)} />
        </div>
      )}

      {caveat && (
        <div className="lay-vd-caveat">
          <Icon.alert className="ic lay-vd-caveat-ic" />
          <span dangerouslySetInnerHTML={richInnerHtml(caveat)} />
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
