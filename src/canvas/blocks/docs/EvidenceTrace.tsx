import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EvidenceTraceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EvidenceTraceProps & { delay?: number };

// How many records to show before collapsing behind a "show all" toggle, so a 50-item
// trace stays card-sized while still being fully reachable.
const PREVIEW = 6;

// "How do you KNOW that?" — the raw records behind a claim, shown verbatim. The headline
// claim sits up top with an optional count summary; below it, each underlying record is
// quoted as-given with its source and timing, then an honest provenance line names where
// the numbers came from. This surface exists to prove a number with REAL records — it
// renders only what it is handed and never invents supporting evidence.
export function EvidenceTrace({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  claim,
  summary,
  items,
  caveat,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;
  const records = items ?? [];
  const [expanded, setExpanded] = useState(false);
  const overflowing = records.length > PREVIEW;
  const shown = expanded ? records : records.slice(0, PREVIEW);
  const hidden = records.length - shown.length;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {claim && (
        <div className="et-claim">
          <span className="et-claim-rail" style={{ background: iconColor }} />
          <div className="et-claim-body">
            <div className="et-claim-text" dangerouslySetInnerHTML={richInnerHtml(claim)} />
            {summary && (
              <span className="et-summary">
                <Icon.chart className="et-summary-ic" style={{ width: 12, height: 12 }} /> {summary}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="et-records-h">
        <Icon.quote className="et-records-h-ic" style={{ width: 12, height: 12 }} />
        Underlying records
        <span className="et-records-count tab-num">{records.length}</span>
      </div>

      <ul className="et-records">
        {shown.map((r, i) => (
          <li key={i} className="et-record">
            <span className="et-marker" />
            <div className="et-record-body">
              <div className="et-record-text">{r.text}</div>
              {(r.source || r.when) && (
                <div className="et-record-meta">
                  {r.source && (
                    <span className="et-source mono">
                      <Icon.link className="et-source-ic" style={{ width: 11, height: 11 }} />
                      {r.source}
                    </span>
                  )}
                  {r.when && <span className="et-when">{r.when}</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {overflowing && (
        <button className="et-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `Show all ${records.length} records`}
          {!expanded && <span className="et-more-n tab-num">+{hidden}</span>}
        </button>
      )}

      {caveat && (
        <div className="et-caveat">
          <Icon.alert className="et-caveat-ic" style={{ width: 13, height: 13 }} />
          <span>{caveat}</span>
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
