import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { RetrievalProps } from './types';

type Props = RetrievalProps & { delay?: number };

function scoreColor(s: number): string {
  if (s >= 0.8) return 'var(--insight)';
  if (s >= 0.6) return 'var(--presence)';
  if (s >= 0.4) return 'var(--warning)';
  return 'var(--text-muted)';
}

export function Retrieval({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  query,
  chunks,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const ranked = chunks.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score);
  // default: top-ranked chunk expanded
  const [open, setOpen] = useState<number>(ranked.length ? ranked[0].i : -1);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {query && (
        <div className="ai-rt-query">
          <Icon.spark className="ic" style={{ color: iconColor }} /> <span>{query}</span>
        </div>
      )}

      <div className="ai-rt">
        {ranked.map(({ c, i }, rank) => {
          const isOpen = open === i;
          const sc = scoreColor(c.score);
          return (
            <div
              className={'ai-rt-chunk' + (isOpen ? ' is-open' : '')}
              key={i}
              style={{ ['--c' as string]: sc } as CSSProperties}
            >
              <button className="ai-rt-head" onClick={() => setOpen(isOpen ? -1 : i)}>
                <span className="ai-rt-rank tab-num">{rank + 1}</span>
                <span className="ai-rt-body">
                  <span className="ai-rt-source">
                    <Icon.doc className="ic" /> {c.source}
                    {c.used && <span className="ai-rt-used">used</span>}
                    {c.tag && (
                      <span
                        className="ai-tag"
                        style={
                          { ['--c' as string]: c.tagColor || 'var(--presence)' } as CSSProperties
                        }
                      >
                        {c.tag}
                      </span>
                    )}
                  </span>
                  <span className="ai-rt-snippet">{c.snippet}</span>
                </span>
                <span className="ai-rt-score">
                  <span className="ai-rt-meter">
                    <span style={{ width: `${c.score * 100}%`, background: sc }} />
                  </span>
                  <span className="tab-num" style={{ color: sc }}>
                    {c.score.toFixed(2)}
                  </span>
                </span>
                <Icon.chevR className={'ai-cot-chev' + (isOpen ? ' is-open' : '')} />
              </button>
              {isOpen && c.body && (
                <div className="ai-rt-detail" dangerouslySetInnerHTML={richInnerHtml(c.body)} />
              )}
            </div>
          );
        })}
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
