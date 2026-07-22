// Supply-chain reorder dashboard — one row per SKU, a level bar drawn over a red/amber/green
// zone track split at safety stock and the reorder point, with a tick mark at the reorder
// point itself. Extends Bulletkpi's bar+target-tick technique to a three-zone background so
// the bar's color reads correctly against WHERE it sits, not just how full it is.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { InventoryreorderProps, InventoryReorderItem } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = InventoryreorderProps & { delay?: number };

type Status = 'critical' | 'low' | 'healthy';

interface Row {
  key: string;
  sku: string;
  label: string;
  level: number;
  max: number;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number | null;
  status: Status;
  levelPct: number;
  safetyPct: number;
  reorderPct: number;
}

const STATUS_COLOR: Record<Status, string> = {
  critical: 'var(--danger)',
  low: 'var(--warning)',
  healthy: 'var(--insight)',
};
const STATUS_LABEL: Record<Status, string> = {
  critical: 'Reorder now',
  low: 'Below reorder point',
  healthy: 'Healthy',
};

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Normalize one loose item into safe render geometry. A malformed reply (a negative level, a
 *  safety stock above the reorder point, a zero/missing max) still renders a sane, ordered bar
 *  instead of a NaN width or an inverted zone — every number is clamped and re-ordered here so
 *  the SVG-free div bars below never see anything but finite, non-negative, monotone values. */
function buildRow(raw: InventoryReorderItem | null | undefined, i: number): Row | null {
  if (!raw || typeof raw !== 'object') return null;
  const sku = typeof raw.sku === 'string' ? raw.sku.trim() : '';
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : sku;
  if (!label) return null; // no identifiable name at all — nothing useful to render

  const level = Number.isFinite(raw.level) ? Math.max(0, raw.level) : 0;
  const rawReorder = Number.isFinite(raw.reorderPoint) ? Math.max(0, raw.reorderPoint) : 0;
  const rawSafety = Number.isFinite(raw.safetyStock) ? Math.max(0, raw.safetyStock as number) : 0;
  // The track's full scale must be at least as large as every value plotted on it, so a caller
  // that under-states `max` (or omits it) never clips the bar or the zones off the visible track.
  const max = Math.max(
    Number.isFinite(raw.max) && raw.max > 0 ? raw.max : 0,
    level,
    rawReorder,
    rawSafety,
    1,
  );
  const reorderPoint = Math.min(rawReorder, max);
  const safetyStock = Math.min(rawSafety, reorderPoint);
  const leadTimeDays = Number.isFinite(raw.leadTimeDays)
    ? Math.max(0, raw.leadTimeDays as number)
    : null;

  const status: Status =
    level <= safetyStock ? 'critical' : level <= reorderPoint ? 'low' : 'healthy';

  return {
    key: sku || `row-${i}`,
    sku,
    label,
    level,
    max,
    safetyStock,
    reorderPoint,
    leadTimeDays,
    status,
    levelPct: clampPct((level / max) * 100),
    safetyPct: clampPct((safetyStock / max) * 100),
    reorderPct: clampPct((reorderPoint / max) * 100),
  };
}

export function InventoryReorder({
  title,
  icon = 'cart',
  iconColor = 'var(--presence)',
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.cart;
  const rows = (Array.isArray(items) ? items : [])
    .map(buildRow)
    .filter((r): r is Row => r !== null);

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rows.length === 0 && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Provide items with a level, a reorder point, and a max.
        </p>
      )}

      {rows.length > 0 && (
        <div className="ir-list">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="ir-row m-fade-rise m-stagger-item"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <div className="ir-head">
                <div className="ir-id">
                  {r.sku && <span className="ir-sku">{r.sku}</span>}
                  <span className="ir-label">{r.label}</span>
                </div>
                <span
                  className="ir-status"
                  style={{ color: STATUS_COLOR[r.status] }}
                  data-mark={r.status === 'critical' ? 'circle' : undefined}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              <div className="ir-track">
                <div className="ir-track-inner">
                  <span className="ir-zone ir-zone--danger" style={{ width: `${r.safetyPct}%` }} />
                  <span
                    className="ir-zone ir-zone--warn"
                    style={{
                      left: `${r.safetyPct}%`,
                      width: `${Math.max(0, r.reorderPct - r.safetyPct)}%`,
                    }}
                  />
                  <span
                    className="ir-zone ir-zone--good"
                    style={{
                      left: `${r.reorderPct}%`,
                      width: `${Math.max(0, 100 - r.reorderPct)}%`,
                    }}
                  />
                  <span
                    className="ir-fill"
                    style={{ width: `${r.levelPct}%`, background: STATUS_COLOR[r.status] }}
                  />
                </div>
                <span
                  className="ir-tick"
                  style={{ left: `${r.reorderPct}%` }}
                  title="reorder point"
                />
              </div>

              <div className="ir-meta faint tab-num">
                {r.level.toLocaleString()} of {r.max.toLocaleString()} · reorder at{' '}
                {r.reorderPoint.toLocaleString()}
                {r.leadTimeDays !== null ? ` · ${r.leadTimeDays}d lead time` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

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
