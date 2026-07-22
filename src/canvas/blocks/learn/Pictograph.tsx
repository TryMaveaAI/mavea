import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';
import type { PictographProps, PictographRow } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PictographProps & { delay?: number };

// Cap the drawn tiles per row so a huge count doesn't blow out the card — the row's own count
// text (always shown) carries the exact number regardless of how many icons render.
const MAX_ICONS = 24;
// Below this fraction of one icon, the remainder isn't worth a sliver of glyph — round it away.
const MIN_PARTIAL = 0.08;

interface RowTiles {
  whole: number;
  frac: number;
  overflow: number;
  total: number;
}

/** How many whole/partial icons a row's count tiles into, at `unitValue` per icon. Guards a
 *  non-positive unit (nothing to divide by) and a non-finite/negative count. */
function tileCount(count: number, unitValue: number): RowTiles {
  if (!(unitValue > 0) || !Number.isFinite(count) || count <= 0) {
    return { whole: 0, frac: 0, overflow: 0, total: 0 };
  }
  const total = count / unitValue;
  const wholeReal = Math.floor(total + 1e-9);
  const frac = Math.max(0, total - wholeReal);
  const whole = Math.min(wholeReal, MAX_ICONS);
  return { whole, frac, overflow: wholeReal - whole, total };
}

function fmtCount(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

function Tile({ iconKey, filled }: { iconKey: IconKey; filled: number }) {
  const Ic = Icon[iconKey] || Icon.chart;
  if (filled >= 1) {
    return <Ic className="lr-pg-icon lr-pg-icon--full" aria-hidden="true" />;
  }
  // A partial tile: a faint full glyph as backdrop, with a bright copy clipped to the filled
  // fraction laid on top — reads as "this one's not full" rather than a stray fractional shape.
  return (
    <span className="lr-pg-partial" aria-hidden="true">
      <Ic className="lr-pg-icon lr-pg-icon--ghost" />
      <Ic
        className="lr-pg-icon lr-pg-icon--fill"
        style={{ clipPath: `inset(0 ${(1 - filled) * 100}% 0 0)` }}
      />
    </span>
  );
}

function PictographRowView({
  row,
  unitValue,
  iconKey,
}: {
  row: PictographRow;
  unitValue: number;
  iconKey: IconKey;
}) {
  const label = typeof row?.label === 'string' && row.label ? row.label : '—';
  const count = Number.isFinite(row?.count) ? row.count : 0;
  const { whole, frac, overflow, total } = tileCount(count, unitValue);
  const showPartial = frac >= MIN_PARTIAL;

  return (
    <div className="lr-pg-row">
      <div className="lr-pg-row-head">
        <span className="lr-pg-label">{label}</span>
        <span className="lr-pg-count">{fmtCount(count)}</span>
      </div>
      <div className="lr-pg-tiles">
        {total <= 0 ? (
          <span className="lr-pg-zero">—</span>
        ) : (
          <>
            {Array.from({ length: whole }, (_, i) => (
              <Tile key={i} iconKey={iconKey} filled={1} />
            ))}
            {showPartial && <Tile key="frac" iconKey={iconKey} filled={frac} />}
            {overflow > 0 && <span className="lr-pg-overflow">+{fmtCount(overflow)}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export function Pictograph({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  icon2,
  unitValue,
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const list = Array.isArray(rows) ? rows : [];
  const validUnit = Number.isFinite(unitValue) && unitValue > 0 ? unitValue : 1;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {list.length === 0 ? (
        <div className="lr-pg-empty">No tally rows to chart.</div>
      ) : (
        <div className="lr-pg-rows">
          {list.map((row, i) => (
            <PictographRowView
              key={i}
              row={row}
              unitValue={validUnit}
              iconKey={i % 2 === 1 && icon2 ? icon2 : icon}
            />
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="lr-pg-key">
          <Ic className="lr-pg-key-ic" /> Each icon = {fmtCount(validUnit)}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
