import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TierListProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TierListProps & { delay?: number };

// Cycled when a row omits its own `color` — S-tier hot, tapering to muted, the familiar
// ranking-tier gradient without inventing new tokens.
const DEFAULT_TIER_COLORS = [
  'var(--danger)',
  'var(--warning)',
  'var(--insight)',
  'var(--presence)',
  'var(--text-muted)',
];

// S/A/B/C ranking rail: a colored tier label anchors each row, items wrap as chips beside
// it. A row with no items still renders — never collapses to nothing — so an intentionally
// empty tier ("nothing is D-tier") reads as a deliberate statement, not a missing row.
export function TierList({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  rows,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const safeRows = rows ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {caption && <div className="tier-caption">{caption}</div>}

      <div className="tier-rows">
        {safeRows.map((row, i) => {
          const color = row.color ?? DEFAULT_TIER_COLORS[i % DEFAULT_TIER_COLORS.length];
          const items = row.items ?? [];
          return (
            <div
              key={i}
              className="tier-row m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i, ['--tier-c' as string]: color } as CSSProperties}
            >
              <div className="tier-rail" title={row.tier}>
                {row.tier}
              </div>
              <div className="tier-items">
                {items.length > 0 ? (
                  items.map((it, j) => (
                    <span key={j} className="tier-chip">
                      {it}
                    </span>
                  ))
                ) : (
                  <span className="tier-empty">—</span>
                )}
              </div>
            </div>
          );
        })}
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
