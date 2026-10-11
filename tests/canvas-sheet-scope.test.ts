// Blocks render on every surface — Live, the gallery, a shared answer, the landing's theatre — so
// a class a block relies on must be styled by a sheet that travels WITH the canvas (the eager
// sheets, or one a canvas module imports). Twice now a class lived only in Live's route sheets:
// the build-layer cards (an 1100px checkmark on a cold gallery visit) and the `.mono`/`.dim`/
// `.faint` utilities (a diff's code in the body face). Both looked right to anyone who had been to
// Live first, because hash routing never unloads a sheet.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';

const SRC = resolve(__dirname, '../src');

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

const cssImports = (file: string, re: RegExp) =>
  [...readFileSync(file, 'utf8').matchAll(re)].map((m) => resolve(dirname(file), m[1]));

function closure(seeds: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...seeds];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    stack.push(...cssImports(f, /@import\s+['"]([^'"]+\.css)['"]/g));
  }
  return seen;
}

const TS_CSS = /^import\s+['"]([^'"]+\.css)['"]/gm;
const travelling = closure([
  ...cssImports(resolve(SRC, 'main.tsx'), TS_CSS),
  ...walk(resolve(SRC, 'canvas'), '.tsx').flatMap((f) => cssImports(f, TS_CSS)),
  ...walk(resolve(SRC, 'canvas'), '.ts').flatMap((f) => cssImports(f, TS_CSS)),
]);

/** Classes a canvas module names that are styled on purpose only by one surface's chrome. */
const SURFACE_OWNED = new Set([
  // Live's header door, rendered by TopicCanvas only inside Live.
  'door-label',
  // Provenance chips: a Live template skin paints them; elsewhere they are plain text.
  'grounded-in-host',
  'grounded-in-label',
  'grounded-in-name',
  'prov-bars',
  'prov-dot',
  'prov-inferred',
  'prov-live',
  // Hooks the landing's answer theatre restyles; the blocks style themselves by other classes.
  'dg-cw-node',
  'mr-map',
]);

describe('canvas stylesheet scope', () => {
  it('styles every class a block names from a sheet that travels with the canvas', () => {
    const definedIn = new Map<string, Set<string>>();
    for (const f of walk(SRC, '.css')) {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
        if (!definedIn.has(m[1])) definedIn.set(m[1], new Set());
        definedIn.get(m[1])!.add(f);
      }
    }
    const stranded: string[] = [];
    for (const f of walk(resolve(SRC, 'canvas'), '.tsx')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/className=(?:"([^"]+)"|\{`([^`$]+)`\}|\{'([^']+)'\})/g)) {
        for (const cls of (m[1] ?? m[2] ?? m[3]).split(/\s+/)) {
          const sheets = definedIn.get(cls);
          if (!sheets || SURFACE_OWNED.has(cls)) continue;
          if (![...sheets].some((s) => travelling.has(s)))
            stranded.push(
              `${cls} (${relative(SRC, f)}) → ${[...sheets].map((s) => relative(SRC, s)).join(', ')}`,
            );
        }
      }
    }
    expect([...new Set(stranded)]).toEqual([]);
  });
});
