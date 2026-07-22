import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ReframeCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ReframeCardProps & { delay?: number };

// A cognitive reframe of ONE stuck thought: the harsh thought VERBATIM, a gentle name for the
// distortion, then the warmer, truer counter-thought — the visual weight lands on the SHIFT from
// the first to the second, not on a scoreboard. Distinct from companionnote (pure reflection, no
// move): this offers a cognitive MOVE. The thought is always the user's own words, never invented.
export function ReframeCard({
  title = 'A gentler take',
  icon = 'spark',
  iconColor = 'var(--presence)',
  thought,
  distortion,
  reframe,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  return (
    <div
      className="card reveal rf-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="rf-thought">
        <div className="rf-tag">What you're telling yourself</div>
        <p className="rf-quote">
          <Icon.quote className="ic rf-quote-ic" style={{ width: 14, height: 14 }} />
          <span dangerouslySetInnerHTML={richInnerHtml(thought)} />
        </p>
        {distortion && <span className="rf-distortion">{distortion}</span>}
      </div>

      <div className="rf-shift" aria-hidden="true">
        <span className="rf-shift-line" />
        <Icon.spark className="ic rf-shift-ic" style={{ width: 13, height: 13 }} />
        <span className="rf-shift-line" />
      </div>

      <div className="rf-reframe">
        <div className="rf-tag rf-tag--true">What's also true</div>
        <p className="rf-counter" dangerouslySetInnerHTML={richInnerHtml(reframe)} />
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
