import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GuitarTabProps, TabNote } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { BlockEmpty } from '../../lib/BlockEmpty';

type Props = GuitarTabProps & { delay?: number };

const STRINGS = 6; // a standard tab staff; string 1 = top (high e), 6 = bottom (low E)
const STRING_GAP = 9;
const STAFF_H = (STRINGS - 1) * STRING_GAP;
const LEFT = 24; // gutter for the tuning letters
const RIGHT = 10;
const TOP_PAD = 18; // room above the first staff for technique arcs
const ROW_BLOCK = 75; // vertical distance between successive rows
const PAD_IN = 9; // inset so a beat-1 note doesn't sit on the barline
const PX_PER_BEAT = 20;
const MAX_MEASURES = 64;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

/** Parse a tuning string ("EADGBE", "DADGAD") into note tokens, low→high. Falls back to the six
 *  standard open strings when the string can't yield exactly six notes. */
function parseTuning(tuning: string | undefined): string[] {
  const fallback = ['E', 'A', 'D', 'G', 'B', 'E'];
  if (typeof tuning !== 'string') return fallback;
  const tokens = tuning.match(/[A-Ga-g][#b]?/g);
  if (!tokens || tokens.length !== STRINGS) return fallback;
  return tokens.map((t) => t[0].toUpperCase() + t.slice(1));
}

// A technique that draws as an arc/line linking two notes on the same string.
const LINKED: Record<string, { glyph: string; arc: boolean }> = {
  h: { glyph: 'h', arc: true }, // hammer-on
  p: { glyph: 'p', arc: true }, // pull-off
  s: { glyph: '/', arc: false }, // slide up
  '/': { glyph: '\\', arc: false }, // slide down
};

export function GuitarTab({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  notes,
  tuning = 'EADGBE',
  beatsPerMeasure = 4,
  measuresPerRow = 4,
  tempo,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.sparkle;
  const bpm = clampInt(beatsPerMeasure, 1, 16, 4);
  const mpr = clampInt(measuresPerRow, 1, 8, 4);
  const tuneNotes = parseTuning(tuning);
  const measureW = Math.max(64, bpm * PX_PER_BEAT);

  const model = useMemo(() => {
    const src: TabNote[] = Array.isArray(notes) ? notes : [];
    const norm = src.map((n) => ({
      measure: clampInt(n?.measure, 1, MAX_MEASURES, 1),
      beat: (() => {
        const b = typeof n?.beat === 'number' ? n.beat : parseFloat(String(n?.beat));
        return Number.isFinite(b) ? Math.min(bpm + 0.999, Math.max(1, b)) : 1;
      })(),
      string: clampInt(n?.string, 1, STRINGS, 1),
      fret: clampInt(n?.fret, 0, 24, 0),
      technique: typeof n?.technique === 'string' ? n.technique : undefined,
    }));

    const totalMeasures = Math.min(
      MAX_MEASURES,
      Math.max(
        1,
        norm.reduce((m, n) => Math.max(m, n.measure), 1),
      ),
    );
    const numRows = Math.ceil(totalMeasures / mpr);

    // Absolute x of a note, and its row.
    const noteX = (measure: number, beat: number): number => {
      const col = (measure - 1) % mpr;
      const frac = (beat - 1) / bpm;
      return LEFT + col * measureW + PAD_IN + frac * (measureW - 2 * PAD_IN);
    };
    const rowOf = (measure: number) => Math.floor((measure - 1) / mpr);

    const placed = norm.map((n) => ({ ...n, x: noteX(n.measure, n.beat), row: rowOf(n.measure) }));

    // Per (row,string) note sequence, ordered by x, so a technique can link to the NEXT played note.
    const seq = new Map<string, typeof placed>();
    for (const p of placed) {
      const key = `${p.row}:${p.string}`;
      const list = seq.get(key) ?? [];
      list.push(p);
      seq.set(key, list);
    }
    for (const list of seq.values()) list.sort((a, b) => a.x - b.x);

    const links: Array<{
      row: number;
      string: number;
      x1: number;
      x2: number;
      glyph: string;
      arc: boolean;
    }> = [];
    for (const list of seq.values()) {
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        const t = n.technique;
        if (!t || !(t in LINKED)) continue;
        const next = list[i + 1];
        const spec = LINKED[t];
        const x2 = next ? next.x : n.x + 14;
        links.push({ row: n.row, string: n.string, x1: n.x, x2, glyph: spec.glyph, arc: spec.arc });
      }
    }

    const measuresInRow = (r: number) => Math.min(mpr, totalMeasures - r * mpr);
    const svgW = LEFT + mpr * measureW + RIGHT;
    const svgH = TOP_PAD + (numRows - 1) * ROW_BLOCK + STAFF_H + 14;
    return { placed, links, numRows, measuresInRow, svgW, svgH };
  }, [notes, bpm, mpr, measureW]);

  const rowTop = (r: number) => TOP_PAD + r * ROW_BLOCK;
  const stringY = (s: number) => (r: number) => rowTop(r) + (s - 1) * STRING_GAP;
  const hasNotes = model.placed.length > 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> <span>{title}</span>
        <span className="gt-meta">
          {tuneNotes.join('')}
          {typeof tempo === 'number' && Number.isFinite(tempo)
            ? `  ·  ♩ = ${Math.round(tempo)}`
            : ''}
        </span>
      </div>

      {!hasNotes ? (
        <BlockEmpty message="No notes to tab out" />
      ) : (
        <div className="gt-wrap">
          <svg
            viewBox={`0 0 ${model.svgW} ${model.svgH}`}
            className="gt-svg"
            role="img"
            aria-label={`Guitar tab: ${title}`}
          >
            {Array.from({ length: model.numRows }, (_, r) => {
              const inRow = model.measuresInRow(r);
              const rowRight = LEFT + inRow * measureW;
              const top = rowTop(r);
              return (
                <g key={`row${r}`}>
                  {/* Six string lines */}
                  {Array.from({ length: STRINGS }, (_, i) => {
                    const y = top + i * STRING_GAP;
                    return (
                      <line
                        key={`ln${i}`}
                        x1={LEFT}
                        y1={y}
                        x2={rowRight}
                        y2={y}
                        className="gt-line"
                      />
                    );
                  })}

                  {/* Tuning letters at the left edge (string 1 on top) */}
                  {Array.from({ length: STRINGS }, (_, i) => {
                    const stringNum = i + 1;
                    const label = tuneNotes[STRINGS - stringNum];
                    return (
                      <text
                        key={`tn${i}`}
                        x={LEFT - 8}
                        y={top + i * STRING_GAP + 3}
                        className="gt-tune"
                        textAnchor="middle"
                      >
                        {label}
                      </text>
                    );
                  })}

                  {/* Barlines at every measure boundary + the opening barline */}
                  {Array.from({ length: inRow + 1 }, (_, m) => {
                    const x = LEFT + m * measureW;
                    return (
                      <line
                        key={`bl${m}`}
                        x1={x}
                        y1={top}
                        x2={x}
                        y2={top + STAFF_H}
                        className={m === 0 ? 'gt-bar gt-bar--start' : 'gt-bar'}
                      />
                    );
                  })}

                  {/* Row's starting measure number */}
                  <text x={LEFT + 2} y={top - 6} className="gt-measure-num" textAnchor="start">
                    {r * mpr + 1}
                  </text>
                </g>
              );
            })}

            {/* Technique links (arcs/slides), drawn under the fret markers */}
            {model.links.map((lk, i) => {
              const y = stringY(lk.string)(lk.row);
              const mx = (lk.x1 + lk.x2) / 2;
              if (lk.arc) {
                const arcTop = y - 7;
                return (
                  <g key={`lk${i}`} className="gt-link">
                    <path
                      d={`M ${lk.x1} ${y - 3} Q ${mx} ${arcTop} ${lk.x2} ${y - 3}`}
                      className="gt-slur"
                      fill="none"
                    />
                    <text x={mx} y={arcTop - 1} className="gt-tech" textAnchor="middle">
                      {lk.glyph}
                    </text>
                  </g>
                );
              }
              return (
                <g key={`lk${i}`} className="gt-link">
                  <line x1={lk.x1 + 5} y1={y - 2} x2={lk.x2 - 5} y2={y - 2} className="gt-slide" />
                  <text x={mx} y={y - 5} className="gt-tech" textAnchor="middle">
                    {lk.glyph}
                  </text>
                </g>
              );
            })}

            {/* Fret markers — a bg pill so the string doesn't strike through the digits */}
            {model.placed.map((n, i) => {
              const y = stringY(n.string)(n.row);
              const mute = n.technique === 'x';
              const bend = n.technique === 'b';
              const label = mute ? 'x' : String(n.fret);
              const w = label.length * 4.4 + 5;
              return (
                <g key={`fn${i}`}>
                  <rect
                    x={n.x - w / 2}
                    y={y - 5.5}
                    width={w}
                    height={11}
                    rx={2}
                    className="gt-fretbg"
                  />
                  <text x={n.x} y={y + 3} className="gt-fret" textAnchor="middle">
                    {label}
                  </text>
                  {bend && (
                    <text x={n.x + w / 2 + 3} y={y + 1} className="gt-tech" textAnchor="start">
                      b↑
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
