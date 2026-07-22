import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SizeChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SizeChartProps & { delay?: number };

// A size comparison chart: one row per size mapped across systems/measurements (US · UK · EU · cm).
// Layout-only — every column header, size, and cell value comes straight from props, so the same
// primitive serves shoes, tops, or trousers without a bespoke component. The highlighted row is
// resolved by matching the user's pick against each row's real `size`, so the right row lights up
// even if the model lists sizes out of order.
export function SizeChart({
  title,
  icon = 'cart',
  iconColor = 'var(--presence)',
  columns,
  rows,
  unit,
  highlight,
  guide,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.cart;
  const norm = (s: string) => s.trim().toLowerCase();
  const hi = highlight ? norm(highlight) : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {caption && <div className="sz-cap">{caption}</div>}

      <div className="sz-scroll">
        <table className="sz-table">
          <thead>
            <tr>
              <th className="sz-th sz-th--size">Size</th>
              {columns.map((c, j) => (
                <th key={j} className="sz-th">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const on = hi !== null && norm(row.size) === hi;
              return (
                <tr key={i} className={`sz-row${on ? ' on' : ''}`}>
                  <th className="sz-size" scope="row">
                    {row.size}
                    {on && <span className="sz-pick">Your size</span>}
                  </th>
                  {columns.map((_, j) => (
                    <td key={j} className="sz-td">
                      {row.values[j] ?? <span className="sz-dash">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(guide || unit) && (
        <div className="sz-guide">
          <Icon.sliders className="sz-guide-ic" />
          <span className="sz-guide-t">
            {unit && <b className="sz-guide-unit">{unit}.</b>} {guide}
          </span>
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
