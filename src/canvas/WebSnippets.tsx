// Live web results rendered as citation cards, each linking out to its source.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { toast } from '../lib/toast';
import { richInnerHtml } from '../lib/richText';
import type { WebSnippetsProps } from '../data/conversation';

type Props = WebSnippetsProps & { delay?: number };

export function WebSnippets({
  title = 'From the web',
  live = true,
  results,
  footer,
  delay,
}: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.globe className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
        {live && (
          <span className="web-live">
            <span className="web-live-dot"></span>live
          </span>
        )}
      </div>
      <div className="web-list">
        {results.map((r, i) => (
          <button
            key={i}
            type="button"
            className="web-result"
            onClick={() => toast('Opening ' + r.domain + ' →')}
          >
            {/* results are ordered by relevance — the first is the lead source */}
            <span
              className="web-fav"
              data-mark={i === 0 ? 'circle' : undefined}
              style={{ background: r.color || 'var(--presence)' }}
            >
              {(r.domain || '?')[0].toUpperCase()}
            </span>
            <span className="web-body">
              <span className="web-title">{r.title}</span>
              <span className="web-url">
                {r.domain}
                {r.path || ''}
              </span>
              <span className="web-excerpt" dangerouslySetInnerHTML={richInnerHtml(r.excerpt)} />
            </span>
            <Icon.external className="web-ext" />
          </button>
        ))}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
