import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ResearchSummaryProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ResearchSummaryProps & { delay?: number };

export function ResearchSummary({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  question,
  method,
  sampleSize,
  findings,
  conclusion,
  limitations,
  source,
  year,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="rs-question">{question}</div>

      {(method || sampleSize) && (
        <div className="rs-meta">
          {method && <span className="rs-meta-chip">{method}</span>}
          {sampleSize && <span className="rs-meta-chip">{sampleSize}</span>}
          {year && <span className="rs-meta-chip">{year}</span>}
        </div>
      )}

      <div className="rs-findings">
        <div className="rs-section-label">Key Findings</div>
        <ul className="rs-findings-list">
          {findings.map((f, i) => (
            <li key={i} className="rs-finding">
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="rs-conclusion">
        <div className="rs-section-label">Conclusion</div>
        <div className="rs-conclusion-body">{conclusion}</div>
      </div>

      {limitations && (
        <div className="rs-limitations">
          <div className="rs-section-label">Limitations</div>
          <div className="rs-limitations-body">{limitations}</div>
        </div>
      )}

      {source && <div className="rs-source">{source}</div>}

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
