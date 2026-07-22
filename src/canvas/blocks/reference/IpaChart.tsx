import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IpaChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = IpaChartProps & { delay?: number };

// IPA phonetics reference. Two built-in layouts the model never has to position by hand:
//
//  - 'vowels'      — the IPA vowel quadrilateral. A trapezoid whose horizontal axis is
//                    backness (front → back) and vertical axis is height (close → open);
//                    the shape narrows toward the bottom because open back vowels sit
//                    further forward than open front ones. Each vowel has a normalized
//                    (backness, height) coordinate in 0..1 and we project it onto the
//                    trapezoid, interpolating the row width so symbols hug the slanted
//                    edges the way a real chart does.
//  - 'consonants'  — the pulmonic consonant grid: rows are manner of articulation, columns
//                    are place. Each cell can hold a voiceless/voiced pair.
//
// The model supplies only which symbols to emphasise (`highlight`) and a few example
// words; the geometry is computed here from the static linguistic tables below.

/** One vowel: its symbol and its position on the quadrilateral (0 = front/close, 1 = back/open). */
interface VowelPos {
  s: string; // IPA symbol
  back: number; // 0 front … 1 back
  high: number; // 0 close … 1 open
  rounded?: boolean; // rounded vowels are drawn to the right of their slot pair
}

// The canonical cardinal + English vowels, by articulatory position. Coordinates follow the
// standard IPA quadrilateral (4 height steps × 3 backness columns, plus the central schwa).
const VOWELS: VowelPos[] = [
  // close
  { s: 'i', back: 0, high: 0 },
  { s: 'y', back: 0, high: 0, rounded: true },
  { s: 'ɨ', back: 0.5, high: 0 },
  { s: 'u', back: 1, high: 0, rounded: true },
  { s: 'ɪ', back: 0.18, high: 0.18 },
  { s: 'ʊ', back: 0.82, high: 0.18, rounded: true },
  // close-mid
  { s: 'e', back: 0, high: 0.34 },
  { s: 'ø', back: 0, high: 0.34, rounded: true },
  { s: 'ə', back: 0.5, high: 0.5 },
  { s: 'o', back: 1, high: 0.34, rounded: true },
  // open-mid
  { s: 'ɛ', back: 0.08, high: 0.66 },
  { s: 'ɜ', back: 0.5, high: 0.66 },
  { s: 'ʌ', back: 0.78, high: 0.66 },
  { s: 'ɔ', back: 1, high: 0.66, rounded: true },
  // open
  { s: 'a', back: 0.06, high: 1 },
  { s: 'æ', back: 0.16, high: 0.84 },
  { s: 'ɑ', back: 0.9, high: 1 },
  { s: 'ɒ', back: 1, high: 1, rounded: true },
];

/** Manner rows of the pulmonic consonant grid. */
const MANNERS = ['Plosive', 'Nasal', 'Fricative', 'Approx.', 'Lateral'] as const;
/** Place columns, ordered front → back of the mouth. */
const PLACES = ['Bilab.', 'Labiod.', 'Dental', 'Alveolar', 'Postalv.', 'Velar', 'Glottal'] as const;

// Pulmonic consonants keyed by "manner|place" → [voiceless, voiced]. A blank string means the
// articulation is impossible or unattested; en dash is rendered for an empty cell.
const CONSONANTS: Record<string, [string, string]> = {
  'Plosive|Bilab.': ['p', 'b'],
  'Plosive|Alveolar': ['t', 'd'],
  'Plosive|Velar': ['k', 'g'],
  'Plosive|Glottal': ['ʔ', ''],
  'Nasal|Bilab.': ['', 'm'],
  'Nasal|Alveolar': ['', 'n'],
  'Nasal|Velar': ['', 'ŋ'],
  'Fricative|Labiod.': ['f', 'v'],
  'Fricative|Dental': ['θ', 'ð'],
  'Fricative|Alveolar': ['s', 'z'],
  'Fricative|Postalv.': ['ʃ', 'ʒ'],
  'Fricative|Glottal': ['h', ''],
  'Approx.|Postalv.': ['', 'ɹ'],
  'Approx.|Velar': ['', 'w'],
  'Lateral|Alveolar': ['', 'l'],
};

/** Normalize a symbol for matching: strip the length mark and brackets so "iː"/"/i/" both hit "i". */
function normSym(s: string): string {
  return s.replace(/[ː/[\].ˈˌ]/g, '').trim();
}

export function IpaChart({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  kind = 'vowels',
  highlight,
  examples,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  const safeExamples = examples ?? [];
  const hot = new Set((highlight ?? []).map(normSym));
  const isHot = (sym: string) => hot.has(normSym(sym));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {kind === 'consonants' ? <ConsonantGrid isHot={isHot} /> : <VowelQuad isHot={isHot} />}

      {caption && <div className="ipa-caption">{caption}</div>}

      {/* symbol → example-word legend */}
      {safeExamples.length > 0 && (
        <ul className="ipa-examples">
          {safeExamples.map((ex, i) => (
            <li key={i} className="ipa-ex" {...(isHot(ex.symbol) ? { 'data-hot': '' } : {})}>
              <span className="ipa-ex-sym">{ex.symbol}</span>
              <span className="ipa-ex-word">{ex.word}</span>
            </li>
          ))}
        </ul>
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

// ── the vowel quadrilateral ───────────────────────────────────────────────────────────
// A trapezoid in a 0..100 × 0..100 viewBox. Front edge (left) is vertical; the back edge
// (right) slants inward toward the bottom, and the open row is itself indented, so the
// figure has the classic IPA "kite" silhouette. We map each vowel's (back, high) into that
// shrinking trapezoid by interpolating the row's left/right bounds at its height.
function VowelQuad({ isHot }: { isHot: (s: string) => boolean }) {
  // Trapezoid corners (viewBox units). Top is wide, bottom is narrower & shifted right.
  const TL = { x: 12, y: 14 };
  const TR = { x: 92, y: 14 };
  const BL = { x: 34, y: 86 };
  const BR = { x: 80, y: 86 };

  // For a given height t (0 top … 1 bottom) the left/right x are linear interpolations of the
  // corners — that is what makes a vowel's horizontal slot narrow as it descends.
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const project = (back: number, high: number) => {
    const left = lerp(TL.x, BL.x, high);
    const right = lerp(TR.x, BR.x, high);
    const y = lerp(TL.y, BL.y, high);
    return { x: lerp(left, right, back), y };
  };

  return (
    <div className="ipa-quad">
      <svg viewBox="0 0 104 100" width="100%" role="img" aria-label="IPA vowel quadrilateral">
        {/* the trapezoid outline */}
        <polygon
          points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={0.8}
        />
        {/* interior height rules at the three intermediate vowel rows */}
        {[0.34, 0.5, 0.66].map((t, i) => {
          const l = project(0, t);
          const r = project(1, t);
          return (
            <line
              key={i}
              x1={l.x}
              y1={l.y}
              x2={r.x}
              y2={r.y}
              stroke="var(--grid-line)"
              strokeWidth={0.5}
            />
          );
        })}
        {/* a faint central spine (the central-backness column) */}
        <line
          x1={project(0.5, 0).x}
          y1={project(0.5, 0).y}
          x2={project(0.5, 1).x}
          y2={project(0.5, 1).y}
          stroke="var(--grid-line)"
          strokeWidth={0.5}
        />

        {/* axis labels — backness across the top, height rotated up the left edge */}
        <text x={TL.x} y={9} className="ipa-axis" textAnchor="start">
          Front
        </text>
        <text x={TR.x} y={9} className="ipa-axis" textAnchor="end">
          Back
        </text>
        {/* rotated axis label: translate to the anchor, THEN rotate (never a bare rotate) */}
        <text className="ipa-axis" transform="translate(6, 50) rotate(-90)" textAnchor="middle">
          Close → Open
        </text>

        {/* the vowels themselves */}
        {VOWELS.map((v) => {
          const p = project(v.back, v.high);
          // rounded vowels sit just to the right of their unrounded partner's slot
          const dx = v.rounded ? 3 : 0;
          const hot = isHot(v.s);
          return (
            <g key={v.s} transform={`translate(${p.x + dx}, ${p.y})`}>
              {hot && <circle r={4.4} className="ipa-vowel-halo" />}
              <text
                className="ipa-vowel"
                textAnchor="middle"
                dominantBaseline="central"
                {...(hot ? { 'data-hot': '' } : {})}
              >
                {v.s}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── the pulmonic consonant grid ───────────────────────────────────────────────────────
// place × manner table. Each filled cell shows the voiceless symbol on the left and the
// voiced one on the right; either may be absent. Highlighted symbols get the accent halo.
function ConsonantGrid({ isHot }: { isHot: (s: string) => boolean }) {
  const Sym = ({ s }: { s: string }) => {
    if (!s) return <span className="ipa-cgrid-empty">·</span>;
    return (
      <span className="ipa-cgrid-sym" {...(isHot(s) ? { 'data-hot': '' } : {})}>
        {s}
      </span>
    );
  };

  return (
    <div className="ipa-cgrid-wrap">
      <table className="ipa-cgrid">
        <thead>
          <tr>
            <th className="ipa-cgrid-corner" />
            {PLACES.map((p) => (
              <th key={p} className="ipa-cgrid-place" scope="col">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MANNERS.map((m) => (
            <tr key={m}>
              <th className="ipa-cgrid-manner" scope="row">
                {m}
              </th>
              {PLACES.map((p) => {
                const pair = CONSONANTS[`${m}|${p}`];
                return (
                  <td key={p} className="ipa-cgrid-cell">
                    {pair ? (
                      <span className="ipa-cgrid-pair">
                        <Sym s={pair[0]} />
                        <Sym s={pair[1]} />
                      </span>
                    ) : (
                      <span className="ipa-cgrid-na" aria-hidden="true" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
