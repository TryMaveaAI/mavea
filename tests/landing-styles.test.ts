// The landing is the ONE surface that renders without a route chunk, so anything it borrows from a
// route-scoped stylesheet is invisible in dev the moment you have already been to Live — hash
// routing never unloads a sheet, so a single trip through #/live styles the landing for the rest of
// the session. Both regressions this pins shipped that way: the document reset (font-family, the
// 8px body margin) lived in Live's sheet, so a first visit painted the ⌘K palette in Times; and the
// Explore dropdown borrowed Live's .tpl-menu, so on a first visit it had no `position` at all and
// laid out inside the topbar's flex row with three of its rows above the top of the window.
//
// The landing now renders behind its own lazy boundary, so its chunk's stylesheets arrive with it
// and describing its chrome there is fine. What is still fatal is borrowing from a sheet only
// ANOTHER route imports: that sheet is absent on a first visit and present once you have been to
// Live. So the landing is judged against the eager sheets PLUS its own chunk's, while the document
// reset is judged against the eager sheets alone — the first paint is the Suspense fallback, which
// lands before the landing chunk does.
//
// So: walk the static module graph from each entry, collect the CSS it actually pulls in, and
// assert the landing's own chrome is fully described by what the landing actually downloads.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const SRC = resolve(__dirname, '../src');
const ENTRY = resolve(SRC, 'main.tsx');

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (/\.(ts|tsx|css)$/.test(c) && existsSync(c)) return c;
  }
  return null;
}

/** Static (value) imports only — `import type` and dynamic `import()` pull nothing into the chunk. */
function staticSpecifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specs: string[] = [];
  const fromRe = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;'"]*?\s+from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  const cssRe = /@import\s+['"]([^'"]+)['"]/g;
  for (const re of [fromRe, bareRe, cssRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) specs.push(m[1]);
  }
  return specs;
}

/** Every stylesheet an entry's static graph downloads, in no particular order. */
function stylesheetsFrom(entry: string): string[] {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  const css: string[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    for (const spec of staticSpecifiers(file)) {
      const target = resolveSpec(file, spec);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      if (target.endsWith('.css')) css.push(target);
      queue.push(target);
    }
  }
  return css;
}

/** Flat `selector { body }` pairs, comments stripped. At-rule wrappers fall out as junk selectors,
 *  which is harmless: we only ever ask whether a given selector appears. */
function rules(files: string[]): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

/** What the first paint downloads, before any route chunk resolves. */
const SHEETS = stylesheetsFrom(ENTRY);
/** What the landing itself has to work with: the eager sheets plus its own lazy chunk's. */
const LANDING_SHEETS = [
  ...new Set([...SHEETS, ...stylesheetsFrom(resolve(SRC, 'flagship/FlagshipHost.tsx'))]),
];
const EAGER_RULES = rules(SHEETS);
const LANDING_RULES = rules(LANDING_SHEETS);

/** Rules whose selector list names `selector` exactly (as one of its comma-separated parts). */
function rulesFor(from: Array<{ selector: string; body: string }>, selector: string) {
  return from.filter((r) =>
    r.selector.split(',').some((part) => part.trim().replace(/\s+/g, ' ') === selector),
  );
}

describe('the landing paints from the eager stylesheets alone', () => {
  it('loads more than just the token layer', () => {
    expect(SHEETS.length).toBeGreaterThan(5);
  });

  it('carries the document reset — a first visit must not open in the browser default serif', () => {
    const body = rulesFor(EAGER_RULES, 'body');
    expect(body.some((r) => /font-family\s*:/.test(r.body))).toBe(true);
    expect(body.some((r) => /margin\s*:\s*0/.test(r.body))).toBe(true);
  });

  it('describes the Explore dropdown\u2019s own popover, not Live\u2019s', () => {
    const menu = rulesFor(LANDING_RULES, '.fl-explore-menu');
    expect(menu.length).toBeGreaterThan(0);
    const declarations = menu.map((r) => r.body).join('\n');
    // Without these it lays out in the topbar's flex row instead of hanging under the trigger.
    expect(declarations).toMatch(/position\s*:\s*absolute/);
    expect(declarations).toMatch(/background\s*:/);
    expect(declarations).toMatch(/z-index\s*:/);
  });

  it('never reaches for a class the landing has no stylesheet for', () => {
    // .tpl-menu is defined only in templates.css, which only Live and its sibling surfaces import.
    const nav = readFileSync(join(SRC, 'flagship/ExploreNav.tsx'), 'utf8');
    expect(nav).not.toContain('tpl-menu');
    // And the landing's chunk must not drag a route-scoped sheet in to satisfy the check above —
    // that would widen LANDING_SHEETS until borrowing from Live passed again.
    expect(LANDING_SHEETS.some((f) => f.endsWith('templates.css'))).toBe(false);
  });
});
