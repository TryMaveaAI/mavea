import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RoomblockdashboardProps, RoomCell, RoomLevel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RoomblockdashboardProps & { delay?: number };

const META: Record<RoomLevel, { c: string; label: string }> = {
  open: { c: 'var(--text-muted)', label: 'Open' },
  held: { c: 'var(--warning)', label: 'Held' },
  booked: { c: 'var(--presence)', label: 'Booked' },
  'checked-in': { c: 'var(--insight)', label: 'Checked in' },
};
// Preference order for the banner's headline color — whichever committed state is most
// prominent reads as the story, "checked-in" (arrived) outranking a mere hold.
const PRIORITY: RoomLevel[] = ['checked-in', 'booked', 'held', 'open'];

// A model can emit a level outside our enum (a typo, "reserved"); fall back to the neutral
// 'open' styling rather than crashing the META lookup.
function normLevel(l: unknown): RoomLevel {
  return l === 'open' || l === 'held' || l === 'booked' || l === 'checked-in' ? l : 'open';
}

export function Roomblockdashboard({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  cols = 4,
  cells,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  const rows: RoomCell[] = Array.isArray(cells) ? cells : [];
  const [hover, setHover] = useState<number | null>(null);

  const counts = PRIORITY.reduce<Record<RoomLevel, number>>(
    (m, l) => {
      m[l] = rows.filter((c) => normLevel(c.level) === l).length;
      return m;
    },
    { 'checked-in': 0, booked: 0, held: 0, open: 0 },
  );
  const committed = rows.length - counts.open;
  // floor the denominator so an empty `cells` array renders 0% instead of NaN%
  const pct = Math.round((committed / (rows.length || 1)) * 100);
  const dominant = PRIORITY.find((l) => counts[l] > 0) ?? 'open';

  // Salient cell: the first checked-in room, else the first booked/held one, else the first cell.
  const salient = (() => {
    for (const l of PRIORITY) {
      if (l === 'open') break;
      const i = rows.findIndex((c) => normLevel(c.level) === l);
      if (i !== -1) return i;
    }
    return 0;
  })();

  const hc = hover != null ? rows[hover] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className="rbd-banner"
        style={{ ['--rbd-c' as string]: META[dominant].c } as CSSProperties}
      >
        <span className="rbd-banner-dot" />
        <span className="rbd-banner-text">
          {rows.length === 0 ? 'No rooms to show' : `${committed}/${rows.length} rooms committed`}
        </span>
        {rows.length > 0 && <span className="rbd-banner-pct tab-num faint">{pct}%</span>}
      </div>

      {rows.length > 0 && (
        <div className="rbd-legend">
          {PRIORITY.filter((l) => counts[l] > 0).map((l) => (
            <span
              key={l}
              className="rbd-legend-pill"
              style={{ ['--rbd-c' as string]: META[l].c } as CSSProperties}
            >
              <span className="rbd-legend-dot" />
              <span className="rbd-legend-n tab-num">{counts[l]}</span>
              <span className="rbd-legend-label">{META[l].label}</span>
            </span>
          ))}
        </div>
      )}

      <div
        className="rbd-grid"
        style={{ ['--rbd-cols' as string]: Math.max(1, cols) } as CSSProperties}
        onMouseLeave={() => setHover(null)}
      >
        {rows.map((c, i) => {
          const level = normLevel(c.level);
          const meta = META[level];
          return (
            <button
              key={i}
              type="button"
              className={`rbd-cell ${level} ${hover === i ? 'on' : ''} m-stagger-item m-scale-in`}
              style={{ ['--i' as string]: i, ['--cell-c' as string]: meta.c } as CSSProperties}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              data-mark={i === salient ? 'circle' : undefined}
            >
              <span className="rbd-cell-glow" />
              <span className="rbd-cell-label">{c.label}</span>
              {c.value && <span className="rbd-cell-val">{c.value}</span>}
            </button>
          );
        })}
      </div>

      <div
        className="rbd-detail"
        data-open={hc != null}
        style={
          {
            ['--rbd-c' as string]: hc ? META[normLevel(hc.level)].c : 'var(--presence)',
          } as CSSProperties
        }
      >
        {hc && (
          <>
            <span className="rbd-detail-top">
              <span className="rbd-detail-name">{hc.label}</span>
              <span className="rbd-detail-state">{META[normLevel(hc.level)].label}</span>
            </span>
            <span className="rbd-detail-sub faint">
              {hc.detail || `${hc.label} — ${hc.value || META[normLevel(hc.level)].label}`}
            </span>
          </>
        )}
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
