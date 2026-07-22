// Shared legend primitive for the canvas charts.
//
// Class names live in the `cx-` namespace and reuse the existing design tokens
// (--grid-line, --line-strong, --text-faint); the CSS ships in canvas/lib/axis.css.

export interface LegendItem {
  label: string;
  /** A CSS color (token or value). */
  color: string;
}

interface LegendProps {
  items: readonly LegendItem[];
  /** Index of the hovered/active series, for emphasis. */
  active?: number | null;
  onHover?: (index: number | null) => void;
  /** Optional click handler (e.g. to toggle a series off). */
  onToggle?: (index: number) => void;
  /** Indices currently toggled off, rendered dimmed. */
  off?: ReadonlySet<number>;
  /** Index Mavéa's drawn gesture should circle. A legend row is a real, tightly-bounded UI
   *  element (swatch + label), so it's what the "circle" gesture should hug for a chart whose
   *  own salient datum is a shape a lasso can't hug cleanly — a pie/donut wedge or sunburst
   *  arc, where circling a point in the middle of a solid color reads as a stray mark. */
  markIndex?: number | null;
}

/**
 * A wrapping legend rendered as buttons (outside the svg, in normal flow so it wraps and
 * stays accessible). Swatches are token-colored; hovering emphasises, clicking toggles when
 * `onToggle` is given.
 */
export function Legend({ items, active, onHover, onToggle, off, markIndex }: LegendProps) {
  if (items.length < 2) return null;
  return (
    <div className="cx-legend">
      {items.map((it, i) => {
        const isOff = off?.has(i);
        return (
          <button
            key={i}
            type="button"
            className={'cx-leg' + (active === i ? ' on' : '') + (isOff ? ' off' : '')}
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
            onClick={onToggle ? () => onToggle(i) : undefined}
            aria-pressed={onToggle ? !isOff : undefined}
            data-mark={i === markIndex ? 'circle' : undefined}
          >
            <i style={{ background: it.color }} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
