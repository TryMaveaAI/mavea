// Text on an accent fill takes an ink derived from the fill (tokens-base.css: --ink-on-fill picks
// black or white by the fill's luminance, at the crossing where both read 4.58:1). These pin the
// seams that keep that true everywhere: one derivation, restated wherever the accent is rebound
// below the root, and never used where a browser without relative colour would drop the whole
// declaration. Whether each fill and ink actually clear 4.5:1 is accent-ink-contrast.test.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Resolver, contrast, readRules } from './helpers/cssInk';

const rules = readRules();
const resolver = new Resolver(rules);
const DERIVED = (token: string) => `color(from var(--${token}) srgb-linear var(--ink-on-fill))`;
/** The accent tokens whose ink and held stops are derived at the root. */
const ACCENTS: Record<string, string[]> = {
  presence: ['--on-presence', '--presence-deep-held', '--presence-soft-held'],
  insight: ['--on-insight', '--insight-held'],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(tsx?|css)$/.test(p) ? [p] : [];
  });
}
const sources = sourceFiles('src').map((f) => ({ f, src: readFileSync(f, 'utf8') }));

describe('the ink on an accent fill', () => {
  it('is derived at the root from the accent itself', () => {
    const root = rules.filter((r) => !r.path.length && r.cond === ':root' && r.supports);
    const decl = (name: string) => root.map((r) => r.decls.get(name)).find(Boolean);
    expect(decl('--on-presence')).toBe(DERIVED('presence'));
    expect(decl('--on-insight')).toBe(DERIVED('insight'));
  });

  it('keeps the crossing in one place every derived ink reads', () => {
    // A copy of the cut that drifts would pick a different ink for the same fill.
    const copies = sources
      .filter(({ f }) => f.endsWith('.css') && !f.endsWith('tokens-base.css'))
      .filter(({ src }) => /sign\(0\.1791|0\.2126 \* r/.test(src))
      .map(({ f }) => f);
    expect(copies).toEqual([]);
  });

  it('reads 4.5:1 on either side of the crossing, where a near-black would not', () => {
    // Every fill takes the ink the token picks; fills just past the crossing are the tightest.
    const ctx = { scope: { template: null, theme: 'dark' as const, host: null }, media: null };
    for (let grey = 100; grey <= 140; grey++) {
      const hex = `#${grey.toString(16).repeat(3)}`;
      const fill = resolver.color(hex, ctx);
      const ink = resolver.color(`color(from ${hex} srgb-linear var(--ink-on-fill))`, ctx);
      expect(contrast(fill, ink), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is restated, with its held stops, wherever the accent is rebound below the root', () => {
    // A custom property resolves where it is declared, so the root's ink belongs to the root's
    // accent; a scope with its own accent must derive its own.
    const rebinds = new Map<string, string[]>();
    for (const r of rules) {
      if (!r.path.length) continue;
      for (const accent of Object.keys(ACCENTS))
        if (r.decls.has(`--${accent}`))
          rebinds.set(r.selector, [...(rebinds.get(r.selector) ?? []), accent]);
    }
    // The markup rebinds it too: the root's live colour, and an embedded figure's skin on its
    // wrapper. A new inline rebinding has to be named here with the selector it lands on.
    const inline = sources
      .filter(
        ({ f, src }) =>
          !f.endsWith('.css') &&
          /setProperty\(\s*['"`]--(presence|insight)['"`]|['"`]--(presence|insight)['"`]\s*:/.test(
            src,
          ),
      )
      .map(({ f }) => f)
      .sort();
    expect(inline).toEqual(['src/app/usePresenceColor.ts', 'src/canvas/embed/bridge.ts']);
    rebinds.set('.figure-embed', ['presence', 'insight']);

    expect(rebinds.has('.study-stage')).toBe(true);
    const missing: string[] = [];
    for (const [selector, accents] of rebinds) {
      const restated = rules.filter((r) => r.selector === selector && r.supports);
      for (const accent of accents)
        for (const token of ACCENTS[accent])
          if (!restated.some((r) => r.decls.has(token))) missing.push(`${selector} ${token}`);
    }
    expect(missing).toEqual([]);
  });

  it('never reaches a browser without relative colour through an unguarded declaration', () => {
    // Outside @supports, a relative colour is dropped whole by an engine that cannot parse it —
    // taking its property back to the inherited or initial value (white text on white, a
    // gradient gone) instead of the fallback beside it.
    const unguarded = rules
      .filter((r) => !r.supports)
      .flatMap((r) =>
        [...r.decls]
          .filter(([, v]) => /(?:oklch|color)\(\s*from\b/.test(v))
          .map(([p]) => `${r.file} ${r.selector} ${p}`),
      );
    expect(unguarded).toEqual([]);
  });
});
