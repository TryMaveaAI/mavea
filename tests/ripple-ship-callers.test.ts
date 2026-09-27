// ripple-ship-callers.test.ts — the in-diff caller search behind a pasted PR's links and area edges.
// Each file's called names are gathered once and every pair is answered from those sets, so this
// pins the result against the plain definition (scan every line of the other file for `name(`) on
// a PR wide enough that a per-pair rescan would show.
import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';

const FILES = 36;
const AREAS = 5;
const pathOf = (i: number): string => `svc${i % AREAS}/lib/file${i}.ts`;
const areaOf = (i: number): string => `svc${i % AREAS}/lib`;

/** Each file reshapes its own function and calls two others — one from a removed line, one from
 *  context — so callers are found on both kinds of line, across and within areas. */
function wideDiff(): string {
  const out: string[] = [];
  for (let i = 0; i < FILES; i++) {
    const p = pathOf(i);
    out.push(`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, '@@ -1,3 +1,3 @@');
    out.push(`-export function fn${i}(a) { return fn${(i * 7 + 3) % FILES}(a); }`);
    out.push(`+export function fn${i}(a, b) { return a + b; }`);
    out.push(` const v = fn${(i * 11 + 5) % FILES}(1);`);
    out.push(` const w = helper(v);`);
  }
  return out.join('\n');
}

/** The plain definition: does any line of the other file call one of these names? */
function callsAnyNaive(lines: readonly string[], names: readonly string[]): boolean {
  return lines.some((line) => names.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(line)));
}

describe('ripple ship — in-diff callers', () => {
  const text = wideDiff();
  const parsed = parseUnifiedDiff(text);
  const model = buildShipFromDiff(parsed);
  const linesByFile = parsed.files.map((f) => f.hunks.flatMap((h) => h.lines.map((l) => l.c)));

  it('links every change to exactly the other files that call its symbols', () => {
    expect(model.changes).toHaveLength(FILES);
    let total = 0;
    model.changes.forEach((change, i) => {
      const names = change.symbols ?? [];
      const expected = parsed.files
        .map((f, j) => ({ f, j }))
        .filter(({ j }) => j !== i && callsAnyNaive(linesByFile[j]!, names))
        .map(({ f }) => f.path);
      expect(change.links.map((l) => l.ref)).toEqual(expected);
      total += expected.length;
    });
    // Two callers per file, from a removed line and a context line.
    expect(total).toBeGreaterThanOrEqual(FILES);
  });

  it('draws one area edge per proved cross-area call, in discovery order', () => {
    const nodeByArea = new Map(
      model.nodes.filter((n) => n.type === 'module').map((n) => [n.label, n.id]),
    );
    const expected: string[] = [];
    model.changes.forEach((change, i) => {
      const names = change.symbols ?? [];
      if (names.length === 0) return;
      parsed.files.forEach((_, j) => {
        if (j === i || areaOf(j) === areaOf(i)) return;
        if (!callsAnyNaive(linesByFile[j]!, names)) return;
        const key = `${nodeByArea.get(areaOf(i))}->${nodeByArea.get(areaOf(j))}`;
        if (!expected.includes(key)) expected.push(key);
      });
    });
    const affects = model.edges
      .filter((e) => e.verb === 'affects')
      .map((e) => `${e.from}->${e.to}`);
    expect(affects).toEqual(expected);
    expect(affects.length).toBeGreaterThan(0);
  });

  it('counts files per area for the impact map', () => {
    const modules = model.nodes.filter((n) => n.type === 'module');
    expect(modules).toHaveLength(AREAS);
    for (const m of modules) {
      const count = parsed.files.filter((f) => f.path.startsWith(`${m.label}/`)).length;
      expect(m.sub).toBe(`${count} files`);
    }
  });
});
