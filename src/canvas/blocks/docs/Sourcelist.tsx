import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { SourcelistProps } from './types';

type Props = SourcelistProps & { delay?: number };
type Sort = 'relevance' | 'az';

export function Sourcelist({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  sources,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const [sort, setSort] = useState<Sort>('relevance');
  // first (top) source expanded by default
  const [open, setOpen] = useState<number | null>(0);

  const ordered = useMemo(() => {
    const idx = sources.map((_, i) => i);
    idx.sort((a, b) =>
      sort === 'relevance'
        ? sources[b].relevance - sources[a].relevance
        : sources[a].domain.localeCompare(sources[b].domain),
    );
    return idx;
  }, [sources, sort]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sl-tabs">
        <button
          className={`sl-tab ${sort === 'relevance' ? 'on' : ''}`}
          onClick={() => setSort('relevance')}
        >
          <Icon.chart className="ic" /> Relevance
        </button>
        <button className={`sl-tab ${sort === 'az' ? 'on' : ''}`} onClick={() => setSort('az')}>
          <Icon.doc className="ic" /> A–Z
        </button>
        <span className="sl-total faint tab-num">{sources.length} sources</span>
      </div>

      <div className="sl-list">
        {ordered.map((si, rank) => {
          const s = sources[si];
          const col = s.color || 'var(--presence)';
          const glyph =
            s.glyph ||
            s.domain
              .replace(/^www\./, '')
              .charAt(0)
              .toUpperCase();
          const on = open === si;
          return (
            <div key={si} className={`sl-row ${on ? 'on' : ''}`}>
              <button className="sl-head" onClick={() => setOpen(on ? null : si)}>
                <span className="sl-rank tab-num">{rank + 1}</span>
                <span
                  className="sl-fav"
                  style={
                    {
                      ['--fc' as string]: col,
                      background: `color-mix(in oklab, ${col} 22%, transparent)`,
                      color: col,
                    } as CSSProperties
                  }
                >
                  {glyph}
                </span>
                <span className="sl-main">
                  <span className="sl-title">{s.titleText}</span>
                  <span className="sl-domain mono faint">
                    {s.domain}
                    {s.date && <span className="sl-date"> · {s.date}</span>}
                  </span>
                </span>
                <span className="sl-rel">
                  <span className="sl-rel-track">
                    <span
                      className="sl-rel-fill"
                      style={{ width: s.relevance + '%', background: col }}
                    />
                  </span>
                  <span className="sl-rel-num tab-num" style={{ color: col }}>
                    {Math.round(s.relevance)}
                  </span>
                </span>
                <Icon.chevR className={`sl-chev ${on ? 'open' : ''}`} />
              </button>
              <div className="sl-detail" data-open={on}>
                {on && s.snippet && (
                  <div className="sl-snippet" dangerouslySetInnerHTML={richInnerHtml(s.snippet)} />
                )}
                {on && (
                  <span className="sl-open mono">
                    <Icon.external className="sl-open-ic" /> {s.domain}
                  </span>
                )}
              </div>
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
