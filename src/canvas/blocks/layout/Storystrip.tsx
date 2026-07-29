import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StorystripProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StorystripProps & { delay?: number };

export function Storystrip({
  title,
  icon = 'slides',
  iconColor = 'var(--presence)',
  panels,
  start = 0,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.slides;
  // panels can arrive empty; floor the upper bound so the clamp never yields -1
  const last = Math.max(0, panels.length - 1);
  const [idx, setIdx] = useState(Math.max(0, Math.min(start, last)));
  const cur = panels[idx];
  const color = cur?.color || 'var(--presence)';
  // Guard the lookup like the eyebrow's: a panel icon name that isn't a real registry key
  // must fall back, not render `undefined` and take the whole card down mid-walk.
  const PIc = (cur?.icon && Icon[cur.icon]) || Icon.spark;
  // display count: never show "0" / leave Next enabled when there are no panels
  const count = Math.max(1, panels.length);

  const go = (n: number) => setIdx((i) => Math.max(0, Math.min(last, i + n)));

  return (
    <div
      className="card reveal lay-story"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--sc' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lay-story-stage" key={idx}>
        <div className="lay-story-panel">
          <div className="lay-story-badge" style={{ background: color }}>
            <PIc className="ic" />
          </div>
          <div className="lay-story-num tab-num">
            {idx + 1}
            <span className="lay-story-of">/ {count}</span>
          </div>
          <div className="lay-story-heading">{cur?.heading}</div>
          {cur?.caption && <div className="lay-story-caption faint">{cur.caption}</div>}
          <div
            className="lay-story-body"
            dangerouslySetInnerHTML={richInnerHtml(cur?.body || '')}
          />
        </div>
      </div>

      <div className="lay-story-track">
        {panels.map((p, i) => (
          <button
            key={i}
            type="button"
            className={`lay-story-tick ${i === idx ? 'on' : ''} ${i < idx ? 'past' : ''}`}
            style={{ ['--tk' as string]: p.color || 'var(--presence)' } as CSSProperties}
            onClick={() => setIdx(i)}
            aria-label={`panel ${i + 1}`}
          />
        ))}
      </div>

      <div className="lay-story-nav">
        <button type="button" className="mini-btn" onClick={() => go(-1)} disabled={idx === 0}>
          <Icon.chevR className="ic" style={{ transform: 'rotate(180deg)' }} /> Back
        </button>
        <span className="lay-story-pos faint tab-num">
          {idx + 1} of {count}
        </span>
        <button
          type="button"
          className="mini-btn accent"
          onClick={() => go(1)}
          disabled={idx === last}
        >
          Next <Icon.chevR className="ic" />
        </button>
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
