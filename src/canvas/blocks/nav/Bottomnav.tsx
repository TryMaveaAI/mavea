import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BottomnavProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BottomnavProps & { delay?: number };

export function Bottomnav({
  title,
  icon = 'screen',
  iconColor = 'var(--presence)',
  tabs,
  active = 0,
  screens,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.screen;
  // floor at 1 so the indicator width `calc(100% / n)` never divides by zero
  const n = Math.max(1, tabs.length);
  const [act, setAct] = useState<number>(Math.min(tabs.length - 1, Math.max(0, active)));

  const screen = screens && screens[act] ? screens[act] : tabs[act]?.label;

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

      <div className="bn-phone">
        <div className="bn-screen" key={act}>
          <div className="bn-screen-glyph">
            {(() => {
              const SIc = tabs[act]?.icon ? Icon[tabs[act].icon] : Icon.spark;
              return <SIc className="ic" />;
            })()}
          </div>
          <div className="bn-screen-title">{screen}</div>
          <div className="bn-screen-sub faint">Tap a tab below</div>
        </div>

        <div className="bn-bar" style={{ ['--bn-n' as string]: n } as CSSProperties} role="tablist">
          <span
            className="bn-indicator"
            style={{ width: `calc(100% / ${n})`, transform: `translateX(${act * 100}%)` }}
            aria-hidden
          />
          {tabs.map((t, i) => {
            const TIc = Icon[t.icon] || Icon.spark;
            const on = act === i;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={on}
                className={`bn-tab ${on ? 'on' : ''}`}
                onClick={() => setAct(i)}
              >
                <span className="bn-tab-ic">
                  <TIc className="ic" />
                  {t.badge ? <span className="bn-tab-badge tab-num">{t.badge}</span> : null}
                </span>
                <span className="bn-tab-label">{t.label}</span>
              </button>
            );
          })}
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
