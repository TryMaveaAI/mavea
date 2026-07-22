// Guards a specific "super slim" failure mode: a horizontally-scrolling `grid-auto-flow: column`
// track (kanban lanes, filmstrips, etc.) whose `grid-auto-columns` is `minmax(0, …)`. Per the CSS
// Grid spec, a bare `1fr` auto-track's implicit minimum is `auto` (min-content) — big enough that
// overflow-x:auto correctly kicks in once lanes run out of room. Wrapping it in `minmax(0, 1fr)`
// overrides that floor to zero, so the `fr` unit greedily divides the container instead of ever
// overflowing: every lane shrinks to a sliver and wrapped text shreds into one character per line.
// This bit `.fl-kanban` (src/canvas/blocks/flows/styles.css) once already; this is a permanent
// source-level guard so no future auto-flow track regresses the same way.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BLOCKS_DIR = join(__dirname, '../src/canvas/blocks');

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(p));
    else if (entry.name.endsWith('.css')) out.push(p);
  }
  return out;
}

describe('scroll-driven auto-column tracks keep a real floor', () => {
  const files = cssFiles(BLOCKS_DIR);

  it('found block-family CSS to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no grid-auto-flow: column track pairs overflow-x: auto with a zero-floor grid-auto-columns', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const css = readFileSync(file, 'utf8');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [, sel, body] = m;
        const autoFlowColumn = /grid-auto-flow:\s*column/.test(body);
        const scrolls = /overflow(-x)?:\s*(auto|scroll)/.test(body);
        const zeroFloor = /grid-auto-columns:\s*minmax\(\s*0\b/.test(body);
        if (autoFlowColumn && scrolls && zeroFloor) {
          offenders.push(`${file}: ${sel.trim()}`);
        }
      }
    }
    expect(
      offenders,
      'zero-floor grid-auto-columns defeats its own overflow-x:auto scroll',
    ).toEqual([]);
  });
});
