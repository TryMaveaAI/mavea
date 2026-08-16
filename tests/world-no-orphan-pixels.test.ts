// No orphan pixels: on the world surface, a number the reader can see must be a number the reader
// can interrogate. The way that promise breaks is never dramatic — someone adds `{node.value}` to a
// card face because the figure "is obviously right there", and a magnitude with no receipt behind
// it is on screen forever after. So this is a source scan, not a render test: every figure in
// src/live/world's JSX has to go through <ProvValue>, which resolves it in the trust registry and
// renders NOTHING when the world cannot back it.
//
// THE RULE, precisely — inside a JSX region (a parenthesised block whose first character is `<`):
//   · no read of a value-bearing field: `.value`
//   · no number formatter: toLocaleString / toFixed / toPrecision / formatValue( / withUnit(
//   · no bare interpolation of a value-ish binding: {x}, {a.b} where the name ends in
//     value / delta / pct / total / amount / figure
// Counts, indices, lengths, keys, geometry and style numbers are all FINE — they are not claims
// about the world, and a gate that flagged them would be turned off within a week. Formatting a
// figure OUTSIDE the JSX (building a WorldValue's `raw`) is likewise fine: that string reaches the
// screen through ProvValue and its card, which is exactly the point.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = 'src/live/world';
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith('.tsx'))
  .sort();

/** Every parenthesised block that opens with a JSX tag, by paren matching — plus the one-line
 *  `return <X />;` form, which the formatter leaves unparenthesised. An object-literal arrow
 *  (`=> ({ … })`) opens with `{`, so it is correctly left out. */
function jsxRegions(src: string): string[] {
  const regions = [...src.matchAll(/(?:return|=>)\s+<[^\n]*/g)].map((m) => m[0]);
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '(') continue;
    const rest = src.slice(i + 1);
    if (!/^\s*<[A-Za-z/>]/.test(rest)) continue;
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '(') depth += 1;
      else if (src[j] === ')') {
        depth -= 1;
        if (depth === 0) {
          regions.push(src.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return regions;
}

/** A form control's own `event.target.value` — the text a reader typed into a picker or filter.
 *  It is never a figure from the world, so it cannot be an orphan pixel. Stripped before the scan
 *  rather than loosening `.value`, which must keep firing on `node.value`, `series.value` and every
 *  other figure-bearing field. Narrow by construction: only `<something>.target.value`. */
const EVENT_TARGET_VALUE = /\b[A-Za-z_$][\w$]*\.target\.value\b/g;

const FORBIDDEN: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /\.value\b/, why: 'reads a value-bearing field straight into the markup' },
  { re: /\.to(?:LocaleString|Fixed|Precision)\s*\(/, why: 'formats a number inside the markup' },
  { re: /\b(?:formatValue|withUnit)\s*\(/, why: 'formats a figure inside the markup' },
  {
    re: /\{\s*[A-Za-z_$][\w$.]*(?:[Vv]alue|[Dd]elta|[Pp]ct|[Tt]otal|[Aa]mount|[Ff]igure)\s*\}/,
    why: 'interpolates a value-ish binding directly',
  },
];

describe('the world surface prints no orphan pixels', () => {
  it('has JSX to scan in the first place', () => {
    expect(FILES.length).toBeGreaterThan(0);
    for (const file of FILES) {
      expect(jsxRegions(readFileSync(join(DIR, file), 'utf8')).length, file).toBeGreaterThan(0);
    }
  });

  it.each(FILES)('%s renders every figure through ProvValue', (file) => {
    const src = readFileSync(join(DIR, file), 'utf8');
    for (const raw of jsxRegions(src)) {
      const region = raw.replace(EVENT_TARGET_VALUE, '');
      for (const { re, why } of FORBIDDEN) {
        const hit = re.exec(region);
        expect(hit === null, `${file}: ${why} — "${hit?.[0] ?? ''}"`).toBe(true);
      }
    }
  });

  it('routes the surface’s own figures through ProvValue', () => {
    const overlay = readFileSync(join(DIR, 'WorldOverlay.tsx'), 'utf8');
    expect(overlay).toMatch(/<ProvValue\b/);
  });
});
