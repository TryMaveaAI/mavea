import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { safeContactUrl } from '../../../lib/sourceHost';
import type { LifelineProps, LifelineResource } from './types';

type Props = LifelineProps & { delay?: number };

// A calm crisis-support surface — the one Mavéa leads with when someone may be in danger. A warm,
// validating opener, then REAL verified helplines made prominent and tappable, an honest note that
// Mavéa is not a substitute for a person who can help, and an optional grounding offer. No metrics,
// no analytics chrome — presence over information. The selector forces this on an acute self-harm /
// abuse / emergency turn and suppresses the reflective surfaces, so the response is never wrong-toned.
export function Lifeline({
  title = 'You deserve support right now',
  message,
  safetyQuestion,
  resources,
  grounding,
  reassurance,
  delay,
}: Props) {
  const safe: LifelineResource[] = resources ?? [];

  return (
    <div
      className="card reveal lfl-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Icon.shield className="ic" style={{ color: 'var(--presence)' }} /> {title}
      </div>

      {message && <p className="lfl-message">{message}</p>}
      {safetyQuestion && <p className="lfl-safety">{safetyQuestion}</p>}

      <div className="lfl-resources">
        {safe.map((r, i) => {
          const inner = (
            <>
              <span className="lfl-res-name">{r.name}</span>
              <span className="lfl-res-contact">{r.contact}</span>
              {r.note && <span className="lfl-res-note">{r.note}</span>}
            </>
          );
          // href is model-supplied, so it goes through the contact gate. A rejected link still
          // shows the resource — the number in `contact` is the lifeline, the anchor is only a
          // tap convenience, and this card must never carry a dead or dangerous link.
          const href = r.href ? safeContactUrl(r.href) : null;
          return href ? (
            <a key={i} className="lfl-res lfl-res--link" href={href}>
              {inner}
            </a>
          ) : (
            <div key={i} className="lfl-res">
              {inner}
            </div>
          );
        })}
      </div>

      {grounding && (
        <div className="lfl-grounding">
          <Icon.spark className="ic" style={{ width: 14, height: 14 }} />
          <span>{grounding}</span>
        </div>
      )}
      {reassurance && <p className="lfl-reassurance">{reassurance}</p>}
    </div>
  );
}
