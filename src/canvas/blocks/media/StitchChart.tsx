import { type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import { estimateTextWidth } from '../../lib/fitText';
import type { StitchChartProps, StitchRow } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StitchChartProps & { delay?: number };

const CELL = 10;
const GUT = 14; // side gutters where the alternating row numbers sit
const MAX_ROWS = 60;
const MAX_STS = 60;

// Built-in meanings for the standard symbol set. `k`/`p` swap on wrong-side rows, so the legend
// states both readings — the chart itself always shows the right-side view, per convention.
const MEANINGS: Record<string, string> = {
  k: 'knit on RS · purl on WS',
  p: 'purl on RS · knit on WS',
  yo: 'yarn over',
  k2tog: 'knit 2 together (right-leaning decrease)',
  ssk: 'slip, slip, knit (left-leaning decrease)',
  c4f: 'cable 4 front (left cross)',
  c4b: 'cable 4 back (right cross)',
  sl: 'slip stitch purlwise',
  bo: 'bind off',
  co: 'cast on',
  mb: 'make bobble',
};

/** The standard chart symbol for one stitch, drawn inside the cell at (x, y). Unknown keys render
 *  as their literal text, shrunk to fit — an authored stitch is never silently dropped. */
function symbol(key: string, x: number, y: number): ReactNode {
  const m = CELL / 2;
  switch (key) {
    case 'k':
      return null; // blank square = knit
    case 'p':
      return <circle cx={x + m} cy={y + m} r={1.15} className="stc-fill" />;
    case 'yo':
      return <circle cx={x + m} cy={y + m} r={2.7} className="stc-stroke" />;
    case 'k2tog':
      return <path d={`M${x + 2.2} ${y + 7.8} L${x + 7.8} ${y + 2.2}`} className="stc-stroke" />;
    case 'ssk':
      return <path d={`M${x + 2.2} ${y + 2.2} L${x + 7.8} ${y + 7.8}`} className="stc-stroke" />;
    case 'sl':
      return (
        <path
          d={`M${x + 2.6} ${y + 3} L${x + 5} ${y + 7.4} L${x + 7.4} ${y + 3}`}
          className="stc-stroke"
        />
      );
    case 'c4f':
      // Front cross: the lower-left→upper-right strand passes OVER (unbroken); the other breaks.
      return (
        <g className="stc-stroke">
          <path d={`M${x + 1.6} ${y + 8.4} L${x + 8.4} ${y + 1.6}`} />
          <path
            d={`M${x + 1.6} ${y + 1.6} L${x + 3.7} ${y + 3.7} M${x + 6.3} ${y + 6.3} L${x + 8.4} ${y + 8.4}`}
          />
        </g>
      );
    case 'c4b':
      return (
        <g className="stc-stroke">
          <path d={`M${x + 1.6} ${y + 1.6} L${x + 8.4} ${y + 8.4}`} />
          <path
            d={`M${x + 1.6} ${y + 8.4} L${x + 3.7} ${y + 6.3} M${x + 6.3} ${y + 3.7} L${x + 8.4} ${y + 1.6}`}
          />
        </g>
      );
    case 'bo':
      return <path d={`M${x + 2} ${y + m} L${x + 8} ${y + m}`} className="stc-stroke stc-heavy" />;
    case 'co':
      return (
        <path
          d={`M${x + 5} ${y + 2.6} L${x + 7.9} ${y + 7.4} L${x + 2.1} ${y + 7.4} Z`}
          className="stc-stroke"
        />
      );
    case 'mb':
      return (
        <g>
          <circle cx={x + m} cy={y + m} r={2.7} className="stc-stroke" />
          <circle cx={x + m} cy={y + m} r={1} className="stc-fill" />
        </g>
      );
    default: {
      // Literal text, shrunk by measured width — never char-capped. A pathologically long key
      // is glyph-squeezed into the cell (textLength) so it can't bleed into its neighbours;
      // the legend below still shows it in full.
      let fs = 3.6;
      while (fs > 1.8 && estimateTextWidth(key, fs) > CELL - 1.6) fs -= 0.2;
      const squeeze = estimateTextWidth(key, fs) > CELL - 1.6;
      return (
        <text
          x={x + m}
          y={y + m}
          className="stc-cellText"
          style={{ fontSize: fs }}
          {...(squeeze ? { textLength: CELL - 1.6, lengthAdjust: 'spacingAndGlyphs' } : {})}
        >
          {key}
        </text>
      );
    }
  }
}

/** One clean stitch key from whatever arrived (a string, or an objectified {text} item). */
function toKey(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const v = o.text ?? o.key ?? o.stitch ?? o.label;
    if (typeof v === 'string') return v.trim();
  }
  return '';
}

/** The stitch keys of one row, tolerating a row given as a plain "k p k2tog" string. Keys never
 *  contain spaces, so every entry is split on whitespace and flattened. */
function rowStitches(row: unknown): string[] {
  if (typeof row === 'string') return row.split(/\s+/).filter(Boolean);
  if (!row || typeof row !== 'object') return [];
  const st = (row as Record<string, unknown>).stitches;
  if (Array.isArray(st)) return st.flatMap((s) => toKey(s).split(/\s+/)).filter(Boolean);
  if (typeof st === 'string') return st.split(/\s+/).filter(Boolean);
  return [];
}

export function StitchChart({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  rows,
  legend,
  gauge,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;

  const parsed = (Array.isArray(rows) ? rows : [])
    .map((r, i) => {
      const obj = r && typeof r === 'object' ? (r as StitchRow) : ({} as StitchRow);
      const num =
        typeof obj.number === 'number' && Number.isFinite(obj.number)
          ? Math.round(obj.number)
          : i + 1;
      const side =
        obj.side === 'WS' ? 'WS' : obj.side === 'RS' ? 'RS' : num % 2 === 0 ? 'WS' : 'RS';
      return { num, side, stitches: rowStitches(r).slice(0, MAX_STS) };
    })
    .filter((r) => r.stitches.length > 0)
    .slice(0, MAX_ROWS);

  if (parsed.length === 0) {
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
        <BlockEmpty message="No chart rows to draw" />
      </div>
    );
  }

  const cols = parsed.reduce((mx, r) => Math.max(mx, r.stitches.length), 0);
  const chartW = cols * CELL;
  const chartH = parsed.length * CELL;
  const vbW = chartW + GUT * 2;
  const vbH = chartH + 4;

  // Legend: the built-in meaning per used key, overridable/extendable via the legend prop.
  const overrides = new Map<string, string>();
  for (const e of Array.isArray(legend) ? legend : []) {
    if (e && typeof e === 'object' && typeof e.key === 'string' && typeof e.meaning === 'string') {
      overrides.set(e.key.trim(), e.meaning);
    }
  }
  const used: string[] = [];
  for (const r of parsed) {
    for (const s of r.stitches) if (!used.includes(s)) used.push(s);
  }

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

      <div className="stc-figwrap">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="stc-svg"
          role="img"
          aria-label={title || 'Stitch chart'}
        >
          <rect x={GUT} y={2} width={chartW} height={chartH} className="stc-frame" />
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={GUT + (i + 1) * CELL}
              y1={2}
              x2={GUT + (i + 1) * CELL}
              y2={2 + chartH}
              className="stc-grid"
            />
          ))}
          {Array.from({ length: parsed.length - 1 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={GUT}
              y1={2 + (i + 1) * CELL}
              x2={GUT + chartW}
              y2={2 + (i + 1) * CELL}
              className="stc-grid"
            />
          ))}

          {parsed.map((row, i) => {
            // Charts read bottom-up: rows[0] sits on the bottom edge.
            const y = 2 + (parsed.length - 1 - i) * CELL;
            const rs = row.side === 'RS';
            return (
              <g key={i}>
                {row.stitches.map((key, j) => {
                  // RS rows are read right→left, so stitch 1 sits in the rightmost cell.
                  const col = rs ? cols - 1 - j : j;
                  const x = GUT + col * CELL;
                  return <g key={j}>{symbol(key, x, y)}</g>;
                })}
                <text
                  x={rs ? GUT + chartW + 3 : GUT - 3}
                  y={y + CELL / 2}
                  className={'stc-rownum' + (rs ? ' rs' : ' ws')}
                >
                  {row.num}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="stc-legend">
        {used.map((key) => (
          <span key={key} className="stc-legchip">
            <svg viewBox="0 0 10 10" className="stc-legswatch" aria-hidden>
              <rect x={0.4} y={0.4} width={9.2} height={9.2} className="stc-frame" />
              {symbol(key, 0, 0)}
            </svg>
            <span className="stc-legkey">{key}</span>
            <span className="stc-legmeaning">
              {overrides.get(key) ?? MEANINGS[key] ?? 'pattern stitch'}
            </span>
          </span>
        ))}
      </div>

      {gauge && (
        <div className="stc-gauge">
          <span className="stc-gauge-k">Gauge</span>
          <span className="stc-gauge-v">{gauge}</span>
        </div>
      )}

      {caption && <div className="stc-caption">{caption}</div>}

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
