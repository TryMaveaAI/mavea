// EtymTree.tsx — word-origin tree: roots flow in from the left, the word sits centre,
// descendants/cognates branch out to the right. Each root and descendant carries a
// language-of-origin badge (Proto-Indo-European, Latin, Old French, …) and an optional
// gloss. Connectors are drawn as smooth bezier paths so the provenance chain reads as
// a single visual flow rather than a flat list.
// Use for vocabulary tuition, historical linguistics, GMAT/GRE word-roots prep,
// etymology footnotes, and any "where did this word come from?" question.
import { useMemo, type CSSProperties } from 'react';
import type { EtymTreeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EtymTreeProps & { delay?: number };

const VB_W = 480;
const PAD = 16;
// Column x-centres (roots | word | descendants).
const COL_ROOTS = 90;
const COL_WORD = 240;
const COL_DESC = 390;
const BOX_W = 120;
const BOX_H = 38;
const ROW_GAP = 14;

// Language family colour hints — readable in light and dark via token mixing.
function langColor(lang: string): string {
  const l = lang.toLowerCase();
  if (l.includes('proto') || l.includes('pie') || l.includes('indo')) return 'var(--text-muted)';
  if (l.includes('latin') || l.includes('greek') || l.includes('ancient')) return 'var(--presence)';
  if (
    l.includes('french') ||
    l.includes('romance') ||
    l.includes('spanish') ||
    l.includes('italian')
  )
    return 'var(--insight)';
  if (l.includes('german') || l.includes('dutch') || l.includes('nordic') || l.includes('norse'))
    return 'var(--warning)';
  if (l.includes('arabic') || l.includes('persian') || l.includes('sanskrit'))
    return 'var(--danger)';
  return 'var(--text-secondary)';
}

// The SVG box is a fixed BOX_W (120) regardless of content — a real gloss ("Astrophysics ·
// Bending of light by gravity") is easily 4x that at these font sizes, and SVG text doesn't
// wrap or clip itself, so it bleeds into whatever sits next to it. Truncate to a conservative
// per-role character budget (derived from BOX_W minus padding, at each class's font-size) and
// keep the untruncated string as a native <title> tooltip so nothing is silently lost.
const FORM_MAX_CHARS = 18; // .et-form: 10px, weight 600
const LANG_MAX_CHARS = 22; // .et-lang: 9px, weight 400

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function EtymTree({ word, roots, descendants, note, footer, delay }: Props) {
  const layout = useMemo(() => {
    const safeRoots = roots ?? [];
    const safeDesc = descendants ?? [];
    const nRoots = safeRoots.length;
    const nDesc = safeDesc.length;
    const nRows = Math.max(nRoots, nDesc, 1);
    const rowH = BOX_H + ROW_GAP;
    const totalH = nRows * rowH - ROW_GAP + PAD * 2 + 12; // +12 for word label below box
    const vbH = Math.max(totalH, 120);

    // Vertical centre of the word box.
    const wordCY = vbH / 2;
    const wordY = wordCY - BOX_H / 2;

    // Roots: vertically centred as a group around wordCY.
    const rootsH = nRoots * rowH - (nRoots > 0 ? ROW_GAP : 0);
    const rootsStartY = wordCY - rootsH / 2;
    const rootBoxes = safeRoots.map((r, i) => ({
      r,
      x: COL_ROOTS - BOX_W / 2,
      y: rootsStartY + i * rowH,
      cy: rootsStartY + i * rowH + BOX_H / 2,
      color: langColor(r.lang),
    }));

    // Descendants: same vertical centring.
    const descH = nDesc * rowH - (nDesc > 0 ? ROW_GAP : 0);
    const descStartY = wordCY - descH / 2;
    const descBoxes = safeDesc.map((d, i) => ({
      d,
      x: COL_DESC - BOX_W / 2,
      y: descStartY + i * rowH,
      cy: descStartY + i * rowH + BOX_H / 2,
      color: langColor(d.lang ?? ''),
    }));

    return { vbH, wordY, wordCY, rootBoxes, descBoxes };
  }, [roots, descendants]);

  const { vbH, wordY, wordCY, rootBoxes, descBoxes } = layout;

  // Bezier path from (x1,y1) to (x2,y2) with horizontal control handles.
  const bezier = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1.toFixed(1)},${y1.toFixed(1)} C ${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="et-wrap">
        <svg
          className="et-svg"
          viewBox={`0 0 ${VB_W} ${vbH}`}
          role="img"
          aria-label={`Etymology of "${word}"`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Root → word connectors */}
          {rootBoxes.map((rb, i) => (
            <path
              key={`rc${i}`}
              d={bezier(COL_ROOTS + BOX_W / 2, rb.cy, COL_WORD - BOX_W / 2, wordCY)}
              fill="none"
              stroke={rb.color}
              strokeWidth="1.5"
              opacity="0.75"
            />
          ))}

          {/* Word → descendant connectors */}
          {descBoxes.map((db, i) => (
            <path
              key={`dc${i}`}
              d={bezier(COL_WORD + BOX_W / 2, wordCY, COL_DESC - BOX_W / 2, db.cy)}
              fill="none"
              stroke={db.color}
              strokeWidth="1.5"
              opacity="0.75"
            />
          ))}

          {/* Root boxes */}
          {rootBoxes.map(({ r, x, y, cy, color }, i) => {
            const langText = r.lang + (r.gloss ? ` · ${r.gloss}` : '');
            return (
              <g key={`r${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={6}
                  className="et-box"
                  style={{ stroke: color }}
                />
                <text x={COL_ROOTS} y={cy - 7} textAnchor="middle" className="et-form">
                  {r.form.length > FORM_MAX_CHARS && <title>{r.form}</title>}
                  {truncate(r.form, FORM_MAX_CHARS)}
                </text>
                <text
                  x={COL_ROOTS}
                  y={cy + 9}
                  textAnchor="middle"
                  className="et-lang"
                  style={{ fill: color }}
                >
                  {langText.length > LANG_MAX_CHARS && <title>{langText}</title>}
                  {truncate(langText, LANG_MAX_CHARS)}
                </text>
              </g>
            );
          })}

          {/* Central word box */}
          <rect
            x={COL_WORD - BOX_W / 2}
            y={wordY}
            width={BOX_W}
            height={BOX_H}
            rx={8}
            className="et-word-box"
          />
          <text x={COL_WORD} y={wordCY + 5} textAnchor="middle" className="et-word">
            {word}
          </text>

          {/* Descendant boxes */}
          {descBoxes.map(({ d, x, y, cy, color }, i) => {
            const langText = d.lang
              ? `${d.lang}${d.gloss ? ` · ${d.gloss}` : ''}`
              : (d.gloss ?? '');
            return (
              <g key={`d${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={6}
                  className="et-box"
                  style={{ stroke: color }}
                />
                <text x={COL_DESC} y={cy - 7} textAnchor="middle" className="et-form">
                  {d.form.length > FORM_MAX_CHARS && <title>{d.form}</title>}
                  {truncate(d.form, FORM_MAX_CHARS)}
                </text>
                <text
                  x={COL_DESC}
                  y={cy + 9}
                  textAnchor="middle"
                  className="et-lang"
                  style={{ fill: color }}
                >
                  {langText.length > LANG_MAX_CHARS && <title>{langText}</title>}
                  {truncate(langText, LANG_MAX_CHARS)}
                </text>
              </g>
            );
          })}

          {/* Column headers */}
          <text x={COL_ROOTS} y={PAD - 4} textAnchor="middle" className="et-col-hdr">
            Roots
          </text>
          {descBoxes.length > 0 && (
            <text x={COL_DESC} y={PAD - 4} textAnchor="middle" className="et-col-hdr">
              Descendants
            </text>
          )}
        </svg>
      </div>

      {note && <div className="et-note">{note}</div>}
      {footer && (
        <div
          className="insight-summary"
          dangerouslySetInnerHTML={richInnerHtml(footer)}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}
