// EtymTree's geometry. Boxes take what the width can spare and grow DOWN for a long form or
// gloss — the gloss is the point of a root, so it wraps rather than ending in "…". Wide cards
// read left to right (roots → word → descendants); when three columns would leave a box too
// narrow to hold a word whole, the tree turns on its side: one column, joined by a spine.
import { fitText, type FitTextResult } from '../../lib/fitText';
import type { EtymTreeProps } from './types';

type Root = NonNullable<EtymTreeProps['roots']>[number];
type Descendant = NonNullable<EtymTreeProps['descendants']>[number];

export const PAD_Y = 8;
export const LINE_GAP = 3;
export const HDR_FS = 11;
const PAD_X = 10;
const HEADER_H = 26;
const ROW_GAP = 12;
const MAX_BOX_W = 230;
/** Below this a box cannot hold "Proto-Indo-European" or "disastrous" unbroken. */
const MIN_BOX_W = 116;
const FORM_FS = 13;
const LANG_FS = 11.5;
const WORD_FS = 17;
const SPINE_X = 8;
const INDENT = 22;

// Language family colour hints — readable in light and dark via token mixing.
function langColor(lang: unknown): string {
  const l = typeof lang === 'string' ? lang.toLowerCase() : '';
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

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export interface PlacedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  form: FitTextResult;
  lang: FitTextResult | null;
  color: string;
}

export interface EtymLayout {
  height: number;
  boxes: PlacedBox[];
  word: { x: number; y: number; w: number; h: number; fit: FitTextResult };
  wires: { d: string; color: string }[];
  headers: { x: number; y: number; anchor: 'start' | 'middle'; label: string }[];
}

type Sized = Omit<PlacedBox, 'x' | 'y' | 'w'>;

function sizeBox(form: string, langText: string, color: string, w: number): Sized {
  const inner = w - PAD_X * 2;
  const f = fitText(form || '—', {
    maxWidth: inner,
    fontSize: FORM_FS,
    minFontSize: 11,
    bold: true,
  });
  const l = langText
    ? fitText(langText, { maxWidth: inner, fontSize: LANG_FS, minFontSize: 10 })
    : null;
  const h =
    PAD_Y * 2 +
    f.lines.length * f.lineHeightPx +
    (l ? LINE_GAP + l.lines.length * l.lineHeightPx : 0);
  return { form: f, lang: l, color, h };
}

const rootText = (r: Root) => {
  const gloss = text(r.gloss);
  return text(r.lang) + (gloss ? ` · ${gloss}` : '');
};
const descText = (d: Descendant) => {
  const lang = text(d.lang);
  const gloss = text(d.gloss);
  return lang ? `${lang}${gloss ? ` · ${gloss}` : ''}` : gloss;
};

function sizeWord(word: string, w: number) {
  const fit = fitText(word, {
    maxWidth: w - PAD_X * 2,
    fontSize: WORD_FS,
    minFontSize: 12,
    bold: true,
  });
  return { fit, h: Math.max(44, PAD_Y * 2 + fit.lines.length * fit.lineHeightPx) };
}

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1.toFixed(1)},${y1.toFixed(1)} C ${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
};

export function etymLayout(
  W: number,
  roots: Root[],
  descendants: Descendant[],
  word: string,
): EtymLayout {
  const gap = Math.max(28, Math.min(W * 0.09, 80));
  const boxW = Math.min(MAX_BOX_W, (W - 2 * gap - 4) / 3);
  return boxW >= MIN_BOX_W
    ? across(W, gap, boxW, roots, descendants, word)
    : down(W, roots, descendants, word);
}

function across(
  W: number,
  gap: number,
  boxW: number,
  roots: Root[],
  descendants: Descendant[],
  word: string,
): EtymLayout {
  const left = (W - (3 * boxW + 2 * gap)) / 2;
  const colX = [left, left + boxW + gap, left + 2 * (boxW + gap)];
  const rootBoxes = roots.map((r) => sizeBox(text(r.form), rootText(r), langColor(r.lang), boxW));
  const descBoxes = descendants.map((d) =>
    sizeBox(text(d.form), descText(d), langColor(d.lang ?? ''), boxW),
  );
  const w = sizeWord(word, boxW);

  const stackH = (boxes: Sized[]) =>
    boxes.reduce((sum, b) => sum + b.h, 0) + Math.max(0, boxes.length - 1) * ROW_GAP;
  const contentH = Math.max(stackH(rootBoxes), stackH(descBoxes), w.h);
  const midY = HEADER_H + contentH / 2;
  const place = (boxes: Sized[], x: number): PlacedBox[] => {
    let y = midY - stackH(boxes) / 2;
    return boxes.map((b) => {
      const at = { ...b, x, y, w: boxW };
      y += b.h + ROW_GAP;
      return at;
    });
  };
  const placedRoots = place(rootBoxes, colX[0]);
  const placedDescs = place(descBoxes, colX[2]);
  const headers: EtymLayout['headers'] = [];
  if (roots.length)
    headers.push({ x: colX[0] + boxW / 2, y: HDR_FS + 4, anchor: 'middle', label: 'Roots' });
  if (descendants.length)
    headers.push({ x: colX[2] + boxW / 2, y: HDR_FS + 4, anchor: 'middle', label: 'Descendants' });

  return {
    height: HEADER_H + contentH + 4,
    boxes: [...placedRoots, ...placedDescs],
    word: { x: colX[1], y: midY - w.h / 2, w: boxW, h: w.h, fit: w.fit },
    wires: [
      ...placedRoots.map((b) => ({
        d: bezier(colX[0] + boxW, b.y + b.h / 2, colX[1], midY),
        color: b.color,
      })),
      ...placedDescs.map((b) => ({
        d: bezier(colX[1] + boxW, midY, colX[2], b.y + b.h / 2),
        color: b.color,
      })),
    ],
    headers,
  };
}

function down(W: number, roots: Root[], descendants: Descendant[], word: string): EtymLayout {
  const boxW = W - INDENT;
  const boxes: PlacedBox[] = [];
  const headers: EtymLayout['headers'] = [];
  const ticks: { y: number; color: string }[] = [];
  let y = 0;
  const section = (label: string, items: Sized[]) => {
    if (!items.length) return;
    headers.push({ x: INDENT, y: y + HDR_FS + 2, anchor: 'start', label });
    y += HEADER_H - 4;
    for (const b of items) {
      boxes.push({ ...b, x: INDENT, y, w: boxW });
      ticks.push({ y: y + b.h / 2, color: b.color });
      y += b.h + 8;
    }
    y += 6;
  };

  section(
    'Roots',
    roots.map((r) => sizeBox(text(r.form), rootText(r), langColor(r.lang), boxW)),
  );
  const w = sizeWord(word, boxW);
  const wordBox = { x: INDENT, y, w: boxW, h: w.h, fit: w.fit };
  ticks.push({ y: y + w.h / 2, color: 'var(--presence)' });
  y += w.h + 14;
  section(
    'Descendants',
    descendants.map((d) => sizeBox(text(d.form), descText(d), langColor(d.lang ?? ''), boxW)),
  );

  const first = ticks[0].y;
  const last = ticks[ticks.length - 1].y;
  return {
    height: y - 10,
    boxes,
    word: wordBox,
    wires: [
      ...(last > first
        ? [{ d: `M ${SPINE_X},${first} V ${last}`, color: 'var(--line-strong)' }]
        : []),
      ...ticks.map((t) => ({ d: `M ${SPINE_X},${t.y} H ${INDENT}`, color: t.color })),
    ],
    headers,
  };
}
