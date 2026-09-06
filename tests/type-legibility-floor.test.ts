// The app has one legibility floor — 9px rendered — and `audit:ui` / `audit:surfaces` enforce it in
// a real browser. Those gates run weekly and, until this change, `audit:surfaces` visited nine
// surfaces. Prism, Synthesis, Dashboards, Flashcards, Courses and the course reader were never
// swept, and 34 labels had drifted below the floor there — down to 7px on a Prism eyebrow and a
// Ripple severity badge.
//
// A browser gate cannot see a surface it does not visit, so the floor is also pinned here, where
// it costs nothing and runs on every push. This is a source scan: vitest runs with `css: false`
// and jsdom computes no layout, so the rendered size is the browser gates' job — but an authored
// `font-size` below the floor in ordinary HTML can only ever paint below it.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', 'src');
const FLOOR_PX = 9;

/** Inside a `viewBox`, `font-size` is in USER UNITS, not pixels: the rendered size is the authored
 *  size times the SVG's screen scale, so an authored 9 can paint at 3.6 and an authored 6 can paint
 *  at 12. The block families are full of such figures, and judging them on the authored number is
 *  meaningless. Their floor is enforced where it is measurable — `protectSvgLabels` at runtime and
 *  `audit:ui` in the browser, both via getScreenCTM. */
const SVG_USER_UNITS = 'canvas/blocks/';

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) cssFiles(full, out);
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

describe('no reader-facing type is authored below the legibility floor', () => {
  it(`declares no font-size under ${FLOOR_PX}px outside the SVG families`, () => {
    const offenders: string[] = [];
    for (const file of cssFiles(ROOT)) {
      if (file.includes(SVG_USER_UNITS)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = /font-size:\s*([0-9]+(?:\.[0-9]+)?)px/.exec(line);
        if (m && parseFloat(m[1]) < FLOOR_PX) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1} — ${m[1]}px`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
