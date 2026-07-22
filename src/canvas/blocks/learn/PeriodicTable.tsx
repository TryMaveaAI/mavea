import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PeriodicTableProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PeriodicTableProps & { delay?: number };

const COLS = 18;
const ROWS = 9; // 7 main periods + lanthanide/actinide rows

export function PeriodicTable({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  elements,
  categories = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const [hot, setHot] = useState<number | null>(null);

  const catColor = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => (m[c.key] = c.color));
    return m;
  }, [categories]);

  // First element flagged `on` is the answer's focus; Mavéa's drawn gesture circles it.
  const salientZ = elements.find((el) => el.on)?.z;

  const active = hot != null ? elements[hot] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="lr-pt" onMouseLeave={() => setHot(null)}>
        <div
          className="lr-pt-grid"
          style={
            {
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, auto)`,
            } as CSSProperties
          }
        >
          {elements.map((el, i) => {
            const col = el.cat ? catColor[el.cat] || 'var(--presence)' : 'var(--text-muted)';
            return (
              <button
                key={el.z}
                className={'lr-pt-cell' + (el.on ? ' on' : '') + (hot === i ? ' hot' : '')}
                data-mark={el.z === salientZ ? 'circle' : undefined}
                style={
                  {
                    gridColumn: Math.max(1, Math.min(COLS, el.col)),
                    gridRow: Math.max(1, Math.min(ROWS, el.row)),
                    ['--c' as string]: col,
                  } as CSSProperties
                }
                onMouseEnter={() => setHot(i)}
                onFocus={() => setHot(i)}
                aria-label={el.name || el.symbol}
              >
                <span className="lr-pt-z">{el.z}</span>
                <span className="lr-pt-sym">{el.symbol}</span>
              </button>
            );
          })}
        </div>

        {active && (
          <div className="lr-pt-detail">
            <span
              className="lr-pt-detail-sym"
              style={{ color: active.cat ? catColor[active.cat] : undefined }}
            >
              {active.symbol}
            </span>
            <span className="lr-pt-detail-body">
              <b>{active.name || active.symbol}</b>
              <span className="faint tab-num"> · Z {active.z}</span>
            </span>
          </div>
        )}

        {categories.length > 0 && (
          <div className="lr-pt-key">
            {categories.map((c) => (
              <span key={c.key} className="lr-pt-key-item">
                <i style={{ background: c.color }} /> {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
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
