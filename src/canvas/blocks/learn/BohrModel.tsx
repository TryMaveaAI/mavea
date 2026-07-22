import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BohrModelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BohrModelProps & { delay?: number };

// Square viewBox with a right-hand gutter for the per-shell occupancy callouts. The atom is
// centred in the LEFT region; the gutter holds right-aligned "shell n: k e⁻" labels so they
// never clip the card edge.
const W = 360;
const H = 300;
const GUTTER = 96; // right column reserved for shell-occupancy labels
const CX = (W - GUTTER) / 2; // atom centre x (in the left region)
const CY = H / 2; // atom centre y
const NUCLEUS_R = 26; // radius of the nucleus disc
const RING_GAP = 24; // radial spacing between successive shells
const FIRST_RING = NUCLEUS_R + RING_GAP; // radius of the innermost (n=1) shell
const DOT_R = 4.2; // electron dot radius

// Standard shell capacities (2n²) — used only to flag an over-filled shell, never to invent
// electrons: we always draw exactly the counts the caller gives.
const SHELL_CAP = [2, 8, 18, 32, 50] as const;

// Configuration-summary text ("2·8·18·32 = 60 e⁻") is right-anchored inside the GUTTER column
// and, for a heavy atom with many shells or high per-shell counts, can run wider than the gutter
// and clip past the card's left edge. Rather than truncate the count (which would misreport the
// real configuration), wrap it across stacked tspan lines sized to fit the gutter.
const CONFIG_FONT = 9.5; // px, matches .boh-config font-size
const CONFIG_CHAR_W = CONFIG_FONT * 0.62; // average glyph width for a bold tabular-nums face
const CONFIG_ROW_H = 11; // px between wrapped summary lines

/** Greedily packs space-delimited words into lines no wider than `maxWidth` (in px, estimated
 *  from average glyph width) — same budget-based idiom as the sibling char-count helpers, just
 *  applied per-line instead of as a single truncation cutoff. A word that alone still exceeds
 *  the budget (e.g. a dot-joined shell count for a many-shell heavy atom, which has no spaces
 *  to break on) is hard-split rather than left to overflow. */
function wrapToWidth(text: string, maxWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / CONFIG_CHAR_W));
  if (text.length <= maxChars) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line) {
      lines.push(line);
      line = '';
    }
  };
  for (const word of words) {
    if (word.length > maxChars) {
      // Too long even on its own line — hard-break it at the char budget.
      flush();
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      flush();
      line = word;
    } else {
      line = next;
    }
  }
  flush();
  return lines;
}

/** Electron dot positions evenly spaced around a ring. A per-ring phase offset keeps dots on
 *  adjacent shells from lining up radially, which reads as a denser, more legible cloud. */
function ringDots(count: number, radius: number, phase: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    // Start at the top (−90°) and go clockwise so a lone valence electron sits at 12 o'clock.
    const a = -Math.PI / 2 + phase + (i / count) * Math.PI * 2;
    out.push({ x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius });
  }
  return out;
}

export function BohrModel({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  protons,
  neutrons,
  shells,
  symbol,
  name,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  const model = useMemo(() => {
    // Keep only the real, positive integer shell counts the caller supplied — never pad or trim
    // to a textbook configuration. The diagram must mirror exactly what was passed in.
    const counts = (shells ?? [])
      .map((n) => Math.max(0, Math.floor(n)))
      .filter((n) => Number.isFinite(n));

    const rings = counts.map((count, i) => {
      const radius = FIRST_RING + i * RING_GAP;
      // A small golden-ratio phase per shell so successive rings interleave their dots.
      const phase = i * 0.9;
      return {
        index: i,
        radius,
        count,
        dots: ringDots(count, radius, phase),
        overFilled: count > (SHELL_CAP[i] ?? Infinity),
      };
    });

    const electronTotal = counts.reduce((s, n) => s + n, 0);
    const mass = protons + (neutrons ?? 0);
    // Net charge: a neutral atom has electrons === protons; a mismatch is an ion.
    const charge = electronTotal - protons;

    return { rings, counts, electronTotal, mass, charge };
  }, [shells, protons, neutrons]);

  const outerR = model.rings.length ? model.rings[model.rings.length - 1].radius : FIRST_RING;

  // Vertical layout of the right-hand occupancy callouts, centred on the atom.
  const labelX = W - 10; // right-aligned text anchor x (inside the gutter)
  const rowH = 18;
  const labelTop = CY - ((model.rings.length - 1) * rowH) / 2;

  const ionSign = model.charge > 0 ? '+' : model.charge < 0 ? '−' : '';
  const ionMag = Math.abs(model.charge);

  // Wrap the configuration summary to the gutter's inner width (from the label anchor back to
  // the leader-line column) so a many-shell / high-count atom can't run past the card edge.
  const configText = `${model.counts.join('·')} = ${model.electronTotal} e⁻`;
  const configLines = wrapToWidth(configText, labelX - (W - GUTTER + 6));
  const configBaseY = H - 14 - (configLines.length - 1) * CONFIG_ROW_H;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="boh-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="boh-svg" role="img" aria-label={title}>
          {/* Electron shells (rings) — drawn first, under the nucleus + dots. */}
          {model.rings.map((r) => (
            <circle
              key={`ring${r.index}`}
              cx={CX}
              cy={CY}
              r={r.radius}
              className={r.overFilled ? 'boh-ring boh-ring--over' : 'boh-ring'}
            />
          ))}

          {/* Nucleus: a disc carrying the proton (and neutron) count. */}
          <circle cx={CX} cy={CY} r={NUCLEUS_R} className="boh-nucleus" />
          <text
            x={CX}
            y={CY - (neutrons !== undefined ? 5 : 0)}
            className="boh-nuc-p"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {protons}p⁺
          </text>
          {neutrons !== undefined && (
            <text
              x={CX}
              y={CY + 8}
              className="boh-nuc-n"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {neutrons}n⁰
            </text>
          )}

          {/* Electron dots — exactly `count` per shell, evenly spaced. */}
          {model.rings.map((r) =>
            r.dots.map((d, j) => (
              <circle
                key={`e${r.index}-${j}`}
                cx={d.x}
                cy={d.y}
                r={DOT_R}
                className="boh-electron"
              />
            )),
          )}

          {/* Element identity, set above the atom (symbol + name). */}
          {symbol && (
            <text x={CX} y={CY - outerR - 16} className="boh-symbol" textAnchor="middle">
              {symbol}
              {ionMag > 0 && (
                <tspan className="boh-ion" dy={-6}>
                  {ionMag > 1 ? ionMag : ''}
                  {ionSign}
                </tspan>
              )}
            </text>
          )}
          {name && (
            <text x={CX} y={CY + outerR + 22} className="boh-name" textAnchor="middle">
              {name}
            </text>
          )}

          {/* Right-hand gutter: leader line + per-shell occupancy, plus a totals row. */}
          {model.rings.map((r, i) => {
            const ly = labelTop + i * rowH;
            // A leader from the ring's right edge across to the label column.
            return (
              <g key={`lbl${r.index}`}>
                <line
                  x1={CX + r.radius}
                  y1={CY}
                  x2={W - GUTTER + 6}
                  y2={ly}
                  className="boh-leader"
                />
                <text x={labelX} y={ly + 3} className="boh-shell-lbl" textAnchor="end">
                  <tspan className="boh-shell-n">n{r.index + 1}</tspan>{' '}
                  <tspan className="boh-shell-e">{r.count} e⁻</tspan>
                </text>
              </g>
            );
          })}

          {/* Configuration summary along the bottom of the gutter — wrapped across multiple
              lines (rather than truncated) so a many-shell atom never overflows the card. */}
          <text x={labelX} y={configBaseY} className="boh-config" textAnchor="end">
            {configLines.map((line, i) => (
              <tspan key={i} x={labelX} dy={i === 0 ? 0 : CONFIG_ROW_H}>
                {line}
              </tspan>
            ))}
          </text>
        </svg>
      </div>

      {/* Honest atomic read-outs computed straight from the inputs. */}
      <div className="boh-stats">
        <span className="boh-stat">
          <i className="boh-stat-k">Protons</i>
          <b className="boh-stat-v">{protons}</b>
        </span>
        {neutrons !== undefined && (
          <span className="boh-stat">
            <i className="boh-stat-k">Neutrons</i>
            <b className="boh-stat-v">{neutrons}</b>
          </span>
        )}
        <span className="boh-stat">
          <i className="boh-stat-k">Electrons</i>
          <b className="boh-stat-v">{model.electronTotal}</b>
        </span>
        <span className="boh-stat">
          <i className="boh-stat-k">Mass no.</i>
          <b className="boh-stat-v">{model.mass}</b>
        </span>
        {model.charge !== 0 && (
          <span className="boh-stat boh-stat--ion">
            <i className="boh-stat-k">Charge</i>
            <b className="boh-stat-v">
              {ionMag > 1 ? ionMag : ''}
              {ionSign}
            </b>
          </span>
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
