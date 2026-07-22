import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PreflightchecklistProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PreflightchecklistProps & { delay?: number };

/**
 * A pilot's walk-around, rendered the way it's actually flown: named phases (Before Start,
 * Before Takeoff, Shutdown…), each a tap-to-tick list in the same box/tick idiom as
 * Actionchecklist. The one thing this checklist adds is `critical` — an item where skipping
 * it is a hazard, not a shortcut, so it carries a standing warning marker until it's ticked.
 */
export function Preflightchecklist({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  aircraft,
  sections,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const [checked, setChecked] = useState<boolean[][]>(() =>
    sections.map((s) => s.items.map((it) => !!it.checked)),
  );

  const toggle = (si: number, ii: number) =>
    setChecked((prev) =>
      prev.map((row, r) => (r === si ? row.map((v, c) => (c === ii ? !v : v)) : row)),
    );

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const doneCount = checked.reduce((n, row) => n + row.filter(Boolean).length, 0);
  const allDone = total > 0 && doneCount === total;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const criticalOpen = sections.some((s, si) =>
    s.items.some((it, ii) => it.critical && !checked[si]?.[ii]),
  );

  let rowIndex = 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {aircraft && <div className="pf-aircraft faint">{aircraft}</div>}

      {total > 0 && (
        <div className="pf-progress">
          <div className="pf-track">
            <div
              className={`pf-fill ${criticalOpen ? 'has-critical' : ''}`}
              style={{ width: pct + '%' }}
            />
          </div>
          <span className={`pf-count tab-num ${allDone ? 'done' : ''}`}>
            {allDone ? 'Cleared' : `${doneCount}/${total}`}
          </span>
        </div>
      )}

      {total === 0 ? (
        <div className="pf-empty faint">No checklist items yet.</div>
      ) : (
        <div className="pf-sections">
          {sections.map((section, si) => {
            if (section.items.length === 0) return null;
            const sectionDone = checked[si]?.filter(Boolean).length ?? 0;
            return (
              <div className="pf-section" key={si}>
                <div className="pf-section-head">
                  <span className="pf-section-name">{section.name}</span>
                  <span className="pf-section-count tab-num">
                    {sectionDone}/{section.items.length}
                  </span>
                </div>
                <div className="pf-list">
                  {section.items.map((it, ii) => {
                    const isDone = checked[si]?.[ii] ?? false;
                    const i = rowIndex++;
                    return (
                      <button
                        key={ii}
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        className={`pf-row m-stagger-item m-fade-rise ${isDone ? 'done' : ''}`}
                        style={{ ['--i' as string]: i } as CSSProperties}
                        onClick={() => toggle(si, ii)}
                      >
                        <span
                          className={`pf-box ${isDone ? 'on' : ''} ${it.critical && !isDone ? 'warn' : ''}`}
                        >
                          {isDone && <Icon.check className="pf-tick" />}
                        </span>
                        <span className="pf-meta">
                          <span className="pf-line">
                            <span className="pf-label">{it.label}</span>
                            {it.critical && (
                              <span className="pf-critical-tag">
                                <Icon.alert className="ic" /> Critical
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
