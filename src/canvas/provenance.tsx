// Provenance badges — the designed language for "how do I know this": LIVE (a pulsing
// accent dot), INFERRED (always amber, never the accent), the evidence pill (bars + label),
// and GROUNDED IN (named source links). Colors ride the provenance tokens in templates.css,
// so every theme template restyles the whole set consistently.
import type { ReactElement } from 'react';
import type { Conf, WebSource } from '../data/conversation';
import { hostOf, safeHttpUrl } from '../lib/sourceHost';

const CONF_LABEL: Record<Conf, string> = {
  strong: 'Strong evidence',
  partial: 'Partial evidence',
  inferred: 'Inferred',
  unverified: 'Unverified',
};

const CONF_BARS: Record<Conf, number> = { strong: 3, partial: 2, inferred: 1, unverified: 1 };

/** The answer is being produced live, right now. */
export function LiveMark({ label = 'Live' }: { label?: string }): ReactElement {
  return (
    <span className="prov-live">
      <i className="prov-dot" aria-hidden="true"></i>
      {label}
    </span>
  );
}

/** A claim that is a best estimate, not a verified fact — always amber. */
export function InferredMark({ count }: { count?: number }): ReactElement {
  return (
    <span className="prov-inferred">
      <i className="prov-dot" aria-hidden="true"></i>
      {count != null ? `${count} ${count === 1 ? 'claim' : 'claims'} inferred` : 'Inferred'}
    </span>
  );
}

/** The boards' evidence pill: ▮▮ bars + an honest label, green for strong, amber for shaky. */
export function EvidencePill({ level, title }: { level: Conf; title?: string }): ReactElement {
  const bars = CONF_BARS[level];
  return (
    <span className={'prov-pill ' + level} title={title}>
      <span className="prov-bars" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < bars ? 'on' : ''}></i>
        ))}
      </span>
      {CONF_LABEL[level]}
    </span>
  );
}

/** Named source links under an answer — renders nothing when there's nothing real to cite.
 *  Links are scheme-gated (URLs come from model output); `hosts` adds the bare hostname
 *  beside each title. */
export function GroundedIn({
  sources,
  hosts = false,
  className,
}: {
  sources: WebSource[];
  hosts?: boolean;
  className?: string;
}): ReactElement | null {
  if (!sources.length) return null;
  return (
    <div className={'grounded-in' + (className ? ` ${className}` : '')}>
      <span className="grounded-in-label">Grounded in</span>
      <ul>
        {sources.map((s, i) => {
          const url = safeHttpUrl(s.url);
          const host = hosts ? hostOf(s.url) : null;
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              ) : (
                <span className="grounded-in-name">{s.title}</span>
              )}
              {host && <span className="grounded-in-host">{host}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
