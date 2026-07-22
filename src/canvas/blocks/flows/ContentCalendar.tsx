import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ContentCalendarProps, ContentCell, ContentStatus } from './types';

type Props = ContentCalendarProps & { delay?: number };

const STATUS_ORDER: ContentStatus[] = ['idea', 'drafted', 'scheduled', 'posted'];
const STATUS_SET = new Set<string>(STATUS_ORDER);
const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: 'Idea',
  drafted: 'Drafted',
  scheduled: 'Scheduled',
  posted: 'Posted',
};
const STATUS_COLOR: Record<ContentStatus, string> = {
  idea: 'var(--text-muted)',
  drafted: 'var(--warning)',
  scheduled: 'var(--presence-soft)',
  posted: 'var(--insight)',
};

// A pipe joins the two halves for the Map lookup key only (never displayed) — good enough
// to disambiguate any platform/week pair this component renders.
function cellKey(platform: string, week: string): string {
  return platform + '|' + week;
}

export function ContentCalendar({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  platforms,
  weeks,
  cells,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const rows = (Array.isArray(platforms) ? platforms : []).filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  const cols = (Array.isArray(weeks) ? weeks : []).filter(
    (w): w is string => typeof w === 'string' && w.trim().length > 0,
  );

  // Indexed by platform+week so render is an O(1) lookup per tile; a duplicate entry for the
  // same slot keeps the last one the model authored.
  const byKey = new Map<string, ContentCell>();
  (Array.isArray(cells) ? cells : []).forEach((c) => {
    if (!c || typeof c.platform !== 'string' || typeof c.week !== 'string') return;
    if (!STATUS_SET.has(c.status)) return;
    byKey.set(cellKey(c.platform, c.week), c);
  });

  const empty = rows.length === 0 || cols.length === 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {empty ? (
        <div className="fl-cc-empty">No calendar rows yet.</div>
      ) : (
        <>
          <div className="fl-cc" style={{ ['--weeks' as string]: cols.length } as CSSProperties}>
            <div className="fl-cc-corner" aria-hidden />
            {cols.map((w) => (
              <div className="fl-cc-weekhead" key={'w-' + w}>
                {w}
              </div>
            ))}
            {rows.map((p, ri) => (
              <Fragment key={'p-' + p}>
                <div
                  className="fl-cc-platform m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: ri } as CSSProperties}
                >
                  {p}
                </div>
                {cols.map((w) => {
                  const cell = byKey.get(cellKey(p, w));
                  return (
                    <div
                      className={'fl-cc-cell' + (cell ? ' has-status' : '')}
                      key={p + '|' + w}
                      style={
                        cell
                          ? ({ ['--c' as string]: STATUS_COLOR[cell.status] } as CSSProperties)
                          : undefined
                      }
                    >
                      {cell && (
                        <>
                          <span className="fl-cc-dot" />
                          <span className="fl-cc-label">
                            {cell.title || cell.format || STATUS_LABEL[cell.status]}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <div className="fl-cc-legend">
            {STATUS_ORDER.map((s) => (
              <span className="fl-cc-legend-item" key={s}>
                <span
                  className="fl-cc-legend-dot"
                  style={{ ['--c' as string]: STATUS_COLOR[s] } as CSSProperties}
                />
                {STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        </>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
