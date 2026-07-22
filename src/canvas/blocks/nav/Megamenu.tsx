import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MegamenuProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MegamenuProps & { delay?: number };

export function Megamenu({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  tabs,
  trigger = 0,
  columns,
  promoTitle,
  promoCopy,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // clamp to 0 (not -1) when tabs is empty so `active`/`trig` stays a valid index
  const trig = Math.max(0, Math.min(tabs.length - 1, Math.max(0, trigger)));
  // Start with the trigger tab's panel expanded so a fresh, no-interaction render shows the
  // menu in full — the in-flow reveal collapses to ~0 height at rest, which would clip the
  // columns in a static preview. Hover/click still toggles it from here.
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<number>(trig);

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

      <div className="mm-shell" onMouseLeave={() => setOpen(false)}>
        <nav className="mm-bar">
          {tabs.map((t, i) => {
            const isTrig = i === trig;
            return (
              <button
                key={i}
                type="button"
                className={`mm-tab ${active === i ? 'on' : ''} ${isTrig ? 'has-panel' : ''}`}
                onMouseEnter={() => {
                  setActive(i);
                  setOpen(isTrig);
                }}
                onFocus={() => {
                  setActive(i);
                  setOpen(isTrig);
                }}
                onClick={() => {
                  setActive(i);
                  if (isTrig) setOpen((o) => !o);
                  else setOpen(false);
                }}
              >
                {t}
                {isTrig && (
                  <Icon.chevR
                    className="ic mm-caret"
                    style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className={`mm-panel ${open ? 'open' : ''}`} role="region" aria-hidden={!open}>
          <div className="mm-panel-inner">
            <div className="mm-cols">
              {columns.map((col, ci) => (
                <div className="mm-col" key={ci}>
                  <div className="mm-heading">{col.heading}</div>
                  {col.links.map((l, li) => {
                    const LIc = l.icon ? Icon[l.icon] : Icon.chevR;
                    return (
                      <button key={li} type="button" className="mm-link">
                        <span className="mm-link-ic">
                          <LIc className="ic" />
                        </span>
                        <span className="mm-link-text">
                          <span className="mm-link-label">
                            {l.label}
                            {l.badge && <span className="mm-link-badge">{l.badge}</span>}
                          </span>
                          {l.desc && <span className="mm-link-desc">{l.desc}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {(promoTitle || promoCopy) && (
                <div className="mm-promo">
                  <span className="mm-promo-glyph">
                    <Icon.spark className="ic" />
                  </span>
                  {promoTitle && <div className="mm-promo-title">{promoTitle}</div>}
                  {promoCopy && (
                    <div
                      className="mm-promo-copy"
                      dangerouslySetInnerHTML={richInnerHtml(promoCopy)}
                    />
                  )}
                  <span className="mm-promo-cta">
                    Explore <Icon.chevR className="ic" />
                  </span>
                </div>
              )}
            </div>
          </div>
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
