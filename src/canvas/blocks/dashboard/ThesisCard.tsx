// ThesisCard — your stated reasoning, verbatim, with the date you said it and the "reconsider if…"
// tripwire it's guarded by. The reasoning is the user's OWN words, so it renders as plain text (never
// dangerouslySetInnerHTML) — no untrusted markup ever reaches the DOM.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ThesisProps } from './types';
import { alertAccent, alertLabel } from './alertTone';

type Props = ThesisProps & { delay?: number };

export function ThesisCard({
  title = 'Why you’re tracking this',
  icon = 'quote',
  iconColor = 'var(--presence)',
  reasoning,
  asOf,
  reconsiderIf,
  tripwireState,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.quote;
  return (
    <div
      className="card reveal dash-thesis"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <blockquote className="dash-thesis-quote" style={{ borderColor: iconColor }}>
        {reasoning}
        {asOf && <span className="dash-thesis-date">{asOf}</span>}
      </blockquote>

      {reconsiderIf && (
        <div className="dash-thesis-tripwire">
          <span className="dash-thesis-recon">Reconsider if:</span>
          <span
            className="dash-chip"
            style={{ ['--chip' as string]: alertAccent(tripwireState ?? 'watching') }}
          >
            {reconsiderIf}
          </span>
          {tripwireState && (
            <span
              className="dash-chip-state"
              style={{ ['--chip' as string]: alertAccent(tripwireState) }}
            >
              {alertLabel(tripwireState)}
            </span>
          )}
        </div>
      )}

      {footer && <div className="dash-foot">{footer}</div>}
    </div>
  );
}
