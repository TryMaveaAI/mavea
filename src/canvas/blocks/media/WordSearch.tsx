import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import { useSeededState } from '../../controls/useSeededState';
import type { WordSearchProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WordSearchProps & { delay?: number };

// The grid must be generated HERE, not by the model: a model-authored letter grid rarely
// contains its own words. Placement is a seeded PRNG (hash → mulberry32) so the same words
// always produce the same puzzle — across turns, replays, and exports.
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// English letter frequencies (per mille) — filler letters drawn from this read as plausible
// text instead of a uniform alphabet soup that makes hidden words pop out.
const LETTER_WEIGHTS = [
  82, 15, 28, 43, 127, 22, 20, 61, 70, 2, 8, 40, 24, 67, 75, 19, 1, 60, 63, 91, 28, 10, 24, 2, 20,
  1,
];
const WEIGHT_TOTAL = LETTER_WEIGHTS.reduce((a, b) => a + b, 0);

function weightedLetter(rnd: () => number): string {
  let roll = rnd() * WEIGHT_TOTAL;
  for (let i = 0; i < 26; i++) {
    roll -= LETTER_WEIGHTS[i];
    if (roll <= 0) return String.fromCharCode(65 + i);
  }
  return 'E';
}

// All 8 reading directions: →, ↓, ↘, ↗ and their reverses.
const DIRS: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];

interface Placement {
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}

interface PuzzleGrid {
  n: number;
  letters: string[];
  placed: Placement[];
  skipped: string[];
}

function canPlace(
  letters: string[],
  n: number,
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number,
): boolean {
  for (let k = 0; k < word.length; k++) {
    const cell = letters[(row + dr * k) * n + (col + dc * k)];
    if (cell !== '' && cell !== word[k]) return false;
  }
  return true;
}

function write(
  letters: string[],
  n: number,
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number,
): void {
  for (let k = 0; k < word.length; k++) letters[(row + dr * k) * n + (col + dc * k)] = word[k];
}

/** The legal start-cell range that keeps a whole word on the board for one axis direction. */
function startRange(n: number, len: number, d: number): { lo: number; span: number } {
  const lo = d < 0 ? len - 1 : 0;
  const hi = d > 0 ? n - len : n - 1;
  return { lo, span: Math.max(1, hi - lo + 1) };
}

function buildPuzzle(words: string[], sizeHint: number | undefined, seedStr: string): PuzzleGrid {
  const longest = words.reduce((mx, w) => Math.max(mx, w.length), 0);
  const wanted = Number.isFinite(sizeHint) ? Math.round(sizeHint as number) : longest + 2;
  const n = Math.min(15, Math.max(8, wanted));

  const letters: string[] = new Array(n * n).fill('');
  const rnd = mulberry32(hashSeed(seedStr));
  const placed: Placement[] = [];
  const skipped: string[] = [];

  // Longest first: long words have the fewest legal slots, so they claim the board before the
  // short ones fragment it. Overlaps on matching letters are allowed (they make better puzzles).
  const order = [...words].sort((a, b) => b.length - a.length);
  for (const word of order) {
    if (word.length > n) {
      skipped.push(word);
      continue;
    }
    let done = false;
    for (let attempt = 0; attempt < 240 && !done; attempt++) {
      const [dr, dc] = DIRS[Math.floor(rnd() * DIRS.length) % DIRS.length];
      const rr = startRange(n, word.length, dr);
      const cc = startRange(n, word.length, dc);
      const row = rr.lo + Math.floor(rnd() * rr.span);
      const col = cc.lo + Math.floor(rnd() * cc.span);
      if (canPlace(letters, n, word, row, col, dr, dc)) {
        write(letters, n, word, row, col, dr, dc);
        placed.push({ word, row, col, dr, dc });
        done = true;
      }
    }
    if (!done) {
      // Random probes ran dry (a crowded board) — sweep every cell × direction from a seeded
      // offset so placement stays deterministic and a word is only skipped when it truly can't fit.
      const cells = n * n;
      const off = Math.floor(rnd() * cells);
      outer: for (let i = 0; i < cells; i++) {
        const idx = (i + off) % cells;
        const row = Math.floor(idx / n);
        const col = idx % n;
        for (const [dr, dc] of DIRS) {
          const endR = row + dr * (word.length - 1);
          const endC = col + dc * (word.length - 1);
          if (endR < 0 || endR >= n || endC < 0 || endC >= n) continue;
          if (canPlace(letters, n, word, row, col, dr, dc)) {
            write(letters, n, word, row, col, dr, dc);
            placed.push({ word, row, col, dr, dc });
            done = true;
            break outer;
          }
        }
      }
      if (!done) skipped.push(word);
    }
  }

  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === '') letters[i] = weightedLetter(rnd);
  }
  return { n, letters, placed, skipped };
}

/** One clean uppercase A–Z word from whatever the stream delivered for a list item. */
function toWord(raw: unknown): string {
  const s =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object'
        ? String(
            (raw as Record<string, unknown>).text ??
              (raw as Record<string, unknown>).word ??
              (raw as Record<string, unknown>).label ??
              '',
          )
        : '';
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

const HIT_ACCENTS = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--insight-soft)',
];

const CELL = 10;

export function WordSearch({
  title,
  icon = 'search',
  iconColor = 'var(--presence)',
  words,
  size,
  seed,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.search;

  const clean = useMemo(() => {
    const src = Array.isArray(words) ? words : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of src) {
      const w = toWord(raw);
      if (w && !seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
      if (out.length >= 18) break; // list + grid capacity; validator caps arrays well above this
    }
    return out;
  }, [words]);

  const puzzle = useMemo(
    () => buildPuzzle(clean, size, typeof seed === 'string' && seed ? seed : clean.join('|')),
    [clean, size, seed],
  );

  // Found-state resets whenever the puzzle itself changes (new words → new grid → fresh hunt).
  const [found, setFound] = useSeededState<readonly string[]>(
    [],
    puzzle.letters.join('') + puzzle.placed.length,
  );
  const foundSet = new Set(found);
  const allFound = puzzle.placed.length > 0 && found.length >= puzzle.placed.length;

  if (clean.length === 0 || puzzle.placed.length === 0) {
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
        <BlockEmpty
          message="No words to hide"
          hint={clean.length ? 'None of the words fit this grid' : undefined}
        />
      </div>
    );
  }

  const { n, letters, placed, skipped } = puzzle;
  const span = n * CELL;
  const accentOf = (word: string): string =>
    HIT_ACCENTS[
      Math.max(
        0,
        placed.findIndex((p) => p.word === word),
      ) % HIT_ACCENTS.length
    ];
  const toggle = (word: string): void => {
    setFound((cur) => (cur.includes(word) ? cur.filter((w) => w !== word) : [...cur, word]));
  };

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

      <div className="wsr-wrap">
        <div className="wsr-gridbox">
          <svg
            viewBox={`0 0 ${span} ${span}`}
            className="wsr-svg"
            role="img"
            aria-label={title || 'Word search grid'}
          >
            {Array.from({ length: n + 1 }, (_, i) => (
              <g key={i}>
                <line x1={i * CELL} y1={0} x2={i * CELL} y2={span} className="wsr-grid" />
                <line x1={0} y1={i * CELL} x2={span} y2={i * CELL} className="wsr-grid" />
              </g>
            ))}

            {/* answer capsules sit UNDER the letters so revealed words stay readable */}
            {placed.map((p) =>
              foundSet.has(p.word) ? (
                <line
                  key={p.word}
                  x1={(p.col + 0.5) * CELL}
                  y1={(p.row + 0.5) * CELL}
                  x2={(p.col + p.dc * (p.word.length - 1) + 0.5) * CELL}
                  y2={(p.row + p.dr * (p.word.length - 1) + 0.5) * CELL}
                  className="wsr-hit"
                  style={{ stroke: accentOf(p.word) }}
                  strokeWidth={CELL * 0.82}
                />
              ) : null,
            )}

            {letters.map((ch, i) => (
              <text
                key={i}
                x={(i % n) * CELL + CELL / 2}
                y={Math.floor(i / n) * CELL + CELL / 2}
                className="wsr-letter"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {ch}
              </text>
            ))}
          </svg>
        </div>

        <div className="wsr-side">
          <div className="wsr-words">
            {clean
              .filter((w) => placed.some((p) => p.word === w))
              .map((w) => {
                const on = foundSet.has(w);
                return (
                  <button
                    key={w}
                    type="button"
                    className={'wsr-word' + (on ? ' on' : '')}
                    aria-pressed={on}
                    onClick={() => toggle(w)}
                  >
                    <span className="wsr-dot" style={{ background: accentOf(w) }} aria-hidden />
                    {w}
                  </button>
                );
              })}
          </div>
          <button
            type="button"
            className="wsr-reveal"
            onClick={() => setFound(allFound ? [] : placed.map((p) => p.word))}
          >
            {allFound ? 'Hide all' : 'Reveal all'}
          </button>
          {skipped.length > 0 && (
            <div className="wsr-skip">Didn’t fit this grid: {skipped.join(', ')}</div>
          )}
        </div>
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
