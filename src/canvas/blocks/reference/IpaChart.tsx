import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IpaChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { BL, BR, TL, TR, VOWEL_HALO_R, projectVowel, vowelLayout } from './ipaVowels';

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
// A trapezoid in a 0..100 × 0..100 viewBox. Front edge (left) slants in toward the bottom, the
// back edge (right) less so, giving the classic IPA silhouette.
function VowelQuad({ isHot }: { isHot: (s: string) => boolean }) {
  const { glyphs, dots } = vowelLayout();
  const spineTop = projectVowel(0.5, 0);
  const spineBottom = projectVowel(0.5, 1);

  return (
    <div className="ipa-quad">
      <svg viewBox="0 0 104 100" width="100%" role="img" aria-label="IPA vowel quadrilateral">
        <polygon
          points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={0.8}
        />
        {/* the close-mid and open-mid rules */}
        {[1 / 3, 2 / 3].map((t, i) => {
          const l = projectVowel(0, t);
          const r = projectVowel(1, t);
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
        <line
          x1={spineTop.x}
          y1={spineTop.y}
          x2={spineBottom.x}
          y2={spineBottom.y}
          stroke="var(--grid-line)"
          strokeWidth={0.5}
        />

        {/* axis labels — backness across the top, height rotated up the left edge */}
        <text x={TL.x} y={6} className="ipa-axis" textAnchor="start">
          Front
        </text>
        <text x={TR.x} y={6} className="ipa-axis" textAnchor="end">
          Back
        </text>
        {/* rotated axis label: translate to the anchor, THEN rotate (never a bare rotate) */}
        <text className="ipa-axis" transform="translate(5, 52) rotate(-90)" textAnchor="middle">
          Close → Open
        </text>

        {dots.map((d) => (
          <circle key={`${d.x},${d.y}`} cx={d.x} cy={d.y} r={0.9} className="ipa-vowel-dot" />
        ))}
        {glyphs.map((g) => {
          const hot = isHot(g.s);
          return (
            <g key={g.s} transform={`translate(${g.x}, ${g.y})`}>
              {hot && <circle r={VOWEL_HALO_R} className="ipa-vowel-halo" />}
              <text
                className="ipa-vowel"
                textAnchor="middle"
                dominantBaseline="central"
                {...(hot ? { 'data-hot': '' } : {})}
              >
                {g.s}
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
