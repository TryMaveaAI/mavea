import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DeflistProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DeflistProps & { delay?: number };

/** strip simple html tags so the search matches visible text, not markup */
function plain(s: string) {
  return s.replace(/<[^>]*>/g, '');
}

export function Deflist({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  placeholder = 'Filter terms…',
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.map((it, i) => ({ it, i }));
    return items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) =>
        (it.term + ' ' + plain(it.def) + ' ' + (it.tag || '')).toLowerCase().includes(needle),
      );
  }, [q, items]);

  return (
    <div
      className="card reveal lay-dl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <label className="lay-dl-search">
        <Icon.eye className="ic lay-dl-search-ic" />
        <input
          className="lay-dl-input"
          type="text"
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button
            type="button"
            className="lay-dl-clear"
            onClick={() => setQ('')}
            aria-label="clear"
          >
            <Icon.x className="ic" />
          </button>
        )}
        <span className="lay-dl-count tab-num faint">{filtered.length}</span>
      </label>

      <dl className="lay-dl-list">
        {filtered.map(({ it, i }) => {
          const color = it.color || 'var(--presence)';
          return (
            <div key={i} className="lay-dl-item">
              <dt className="lay-dl-term">
                <span className="lay-dl-dot" style={{ background: color }} />
                <span className="lay-dl-term-text">{it.term}</span>
                {it.tag && <span className="lay-dl-tag">{it.tag}</span>}
              </dt>
              <dd className="lay-dl-def" dangerouslySetInnerHTML={richInnerHtml(it.def)} />
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="lay-dl-empty faint">
            <Icon.eyeOff className="ic" /> No terms match “{q}”.
          </div>
        )}
      </dl>

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
