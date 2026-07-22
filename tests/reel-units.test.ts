// Guards the reel's aspect-stable unit system — the thing that makes every finish fit in all three
// share formats (Story 9:16, Square 1:1, Landscape 16:9).
//
// Finishes MUST size in the design units `var(--ru)` / `var(--rw)` (px values the player sets from the
// board's smaller edge), NOT in raw container units `cqh` / `cqw`. Raw `cqh` keys off board HEIGHT, so
// on a short landscape board type collapses to illegible and content runs off-frame — the exact bug
// this system fixed. If a new finish (or an edit) reintroduces a raw container unit, this fails.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const reelDir = join(__dirname, '../src/clip/reel');

function files(dir: string, ext: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p, ext);
    return ext.some((x) => e.name.endsWith(x)) ? [p] : [];
  });
}

// A raw container unit is a number directly followed by cqh/cqw/cqi/cqb/cqmin/cqmax. We allow them only
// inside reel.css's fallback declarations (`--ru: 1cqh; --rw: 1cqw;`).
const RAW_CQ = /\d(?:\.\d+)?cq(?:h|w|i|b|min|max)\b/g;

/** Strip block and line comments so we don't flag prose (e.g. this file's own notes) as offenders. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('reel aspect-stable units', () => {
  const finishFiles = [
    ...files(join(reelDir, 'templates'), ['.tsx', '.ts']),
    join(reelDir, 'reel.css'),
  ];

  it('no finish or shared CSS uses a raw container unit (must use var(--ru)/var(--rw))', () => {
    const offenders: string[] = [];
    for (const f of finishFiles) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const line of src.split('\n')) {
        if (!RAW_CQ.test(line)) continue;
        RAW_CQ.lastIndex = 0;
        // The two intentional fallbacks declare the custom properties themselves.
        if (/--ru:\s*1cqh/.test(line) || /--rw:\s*1cqw/.test(line)) continue;
        offenders.push(`${f.replace(reelDir + '/', '')}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(offenders, `raw container units found:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('scrolling-marquee finishes carry data-reel-marquee so FitScale excludes their scroll track', () => {
    // A continuous scroll track = `width: max-content` + a `linear infinite` animation. It must be
    // marked, or FitScale would shrink the whole finish to fit the (deliberately huge) track.
    const need: string[] = [];
    for (const f of files(join(reelDir, 'templates/finishes'), ['.tsx'])) {
      const src = readFileSync(f, 'utf8');
      const scrolls = /max-content/.test(src) && /linear infinite/.test(src);
      if (scrolls && !/data-reel-marquee/.test(src)) need.push(f.replace(reelDir + '/', ''));
    }
    expect(need, `scroll tracks missing data-reel-marquee:\n${need.join('\n')}`).toEqual([]);
  });
});
