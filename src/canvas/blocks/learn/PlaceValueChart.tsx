import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PlaceColumn, PlaceValueChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PlaceValueChartProps & { delay?: number };

// Place columns, biggest first, with the power of ten each represents.
const PLACES: { key: PlaceColumn; label: string; power: number }[] = [
  { key: 'thousands', label: 'Thousands', power: 1000 },
  { key: 'hundreds', label: 'Hundreds', power: 100 },
  { key: 'tens', label: 'Tens', power: 10 },
  { key: 'ones', label: 'Ones', power: 1 },
];

/** The base-ten block glyph for a place: a 10×10 hundred-flat, a ten-rod, or a unit cube. */
function blockGlyph(power: number, key: string) {
  if (power === 1000) {
    // A thousands cube — a flat with a depth offset to read as a 3-D cube.
    return (
      <span key={key} className="lr-pv-block lr-pv-block--cube" aria-hidden="true">
        <span className="lr-pv-cube-face" />
        <span className="lr-pv-cube-top" />
        <span className="lr-pv-cube-side" />
      </span>
    );
  }
  if (power === 100) {
    return <span key={key} className="lr-pv-block lr-pv-block--flat" aria-hidden="true" />;
  }
  if (power === 10) {
    return <span key={key} className="lr-pv-block lr-pv-block--rod" aria-hidden="true" />;
  }
  return <span key={key} className="lr-pv-block lr-pv-block--unit" aria-hidden="true" />;
}

export function PlaceValueChart({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  value,
  columns,
  showBlocks = true,
  expanded = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const { cols, parts } = useMemo(() => {
    const n = Math.max(0, Math.floor(Math.abs(value)));
    // Which columns to draw: caller's choice, else the smallest set that holds the value (≥ ones).
    const chosen: PlaceColumn[] =
      columns && columns.length
        ? columns
        : PLACES.filter((pl) => n >= pl.power || pl.power === 1).map((pl) => pl.key);
    const order = PLACES.filter((pl) => chosen.includes(pl.key));

    const colData = order.map((pl) => ({
      ...pl,
      digit: Math.floor(n / pl.power) % 10,
    }));
    // Expanded form, dropping zero places (e.g. 347 → 300 + 40 + 7; 0 stays "0").
    const ps = colData.filter((c) => c.digit !== 0).map((c) => c.digit * c.power);
    return { cols: colData, parts: ps.length ? ps : [0] };
  }, [value, columns]);

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

      <div className="lr-pv-grid" style={{ ['--cols' as string]: cols.length } as CSSProperties}>
        {cols.map((c) => (
          <div key={c.key} className="lr-pv-col">
            <div className="lr-pv-place">{c.label}</div>
            <div className="lr-pv-digit">{c.digit}</div>
            {showBlocks && (
              <div className="lr-pv-blocks" aria-label={`${c.digit} ${c.label.toLowerCase()}`}>
                {Array.from({ length: c.digit }, (_, i) => blockGlyph(c.power, `${c.key}-${i}`))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expanded form, computed straight from the digits. */}
      {expanded && (
        <div className="lr-pv-expanded">
          {parts.map((part, i) => (
            <span key={i} className="lr-pv-part">
              {i > 0 && <span className="lr-pv-plus">+</span>}
              <span className="lr-pv-part-v">{part.toLocaleString()}</span>
            </span>
          ))}
          <span className="lr-pv-eq">=</span>
          <span className="lr-pv-part-v lr-pv-part-v--total">
            {Math.max(0, Math.floor(Math.abs(value))).toLocaleString()}
          </span>
        </div>
      )}

      {caption && <p className="lr-pv-cap">{caption}</p>}

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
