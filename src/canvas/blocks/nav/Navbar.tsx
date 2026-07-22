import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NavbarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NavbarProps & { delay?: number };

export function Navbar({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  brand,
  brandIcon = 'spark',
  links,
  active = 0,
  searchPlaceholder = 'Search…',
  avatar = 'AM',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const Brand = Icon[brandIcon] || Icon.spark;
  // clamp to 0 (not -1) when links is empty so the active index stays valid
  const [act, setAct] = useState<number>(
    Math.max(0, Math.min(links.length - 1, Math.max(0, active))),
  );
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--nav-c' as string]: color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="nv-bar">
        <div className="nv-brand">
          <span className="nv-brand-glyph">
            <Brand className="ic" />
          </span>
          <span className="nv-brand-name">{brand}</span>
        </div>

        <nav className="nv-links">
          {links.map((l, i) => {
            const LIc = l.icon ? Icon[l.icon] : null;
            return (
              <button
                key={i}
                type="button"
                className={`nv-link ${act === i ? 'on' : ''}`}
                onClick={() => setAct(i)}
              >
                {LIc && <LIc className="ic nv-link-ic" />}
                {l.label}
                {l.badge ? <span className="nv-link-badge tab-num">{l.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="nv-right">
          <label className={`nv-search ${focus ? 'focus' : ''}`}>
            <svg
              className="ic nv-search-ic"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="nv-search-input"
              value={q}
              placeholder={searchPlaceholder}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
            />
            <span className="nv-kbd">⌘K</span>
          </label>
          <button type="button" className="nv-icon-btn" aria-label="Notifications">
            <Icon.bell className="ic" />
            <span className="nv-dot" />
          </button>
          <button type="button" className="nv-avatar">
            {avatar}
          </button>
        </div>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
