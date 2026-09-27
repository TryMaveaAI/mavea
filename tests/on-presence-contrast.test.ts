// Text on a --presence fill is --on-presence, which picks its ink from the accent's OKLab
// lightness (tokens-base.css). Every template x theme restates --presence, and on the dark themes
// the accent is light: plain white on them measured 1.85-3.1:1. This holds the rule against every
// accent the stylesheets declare, so a new template whose accent lands where neither ink reads
// fails here instead of on a button.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function parseHex(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => linear(parseInt(h.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
}

const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** OKLab lightness of a linear-sRGB colour (Ottosson's matrices). */
function oklabL([r, g, b]: [number, number, number]): number {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

type Lab = [number, number, number];

function toOklab([r, g, b]: [number, number, number]): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear sRGB of an OKLab colour, clipped to the gamut as a browser paints it. */
function fromOklab([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const tokens = read('src/styles/tokens-base.css');
const rule = /--ink-on-fill:\s*clamp\(([\d.]+), \(([\d.]+) - l\)/.exec(tokens);
/** The accent's ink, as the root and any rebinding scope derive it. */
const DERIVED = /--on-presence:\s*oklch\(\s*from var\(--presence\) var\(--ink-on-fill\)\s*\)/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

const sheets = cssFiles('src').map((f) => ({ f, css: read(f) }));

/** Every value any stylesheet gives a custom property. */
const declared = new Map<string, string[]>();
for (const { css } of sheets) {
  for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;{}]+);/g)) {
    declared.set(name, [...(declared.get(name) ?? []), value.trim()]);
  }
}

/** The literal colours a property can end up as, following var() chains through every sheet. */
function literals(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  return (declared.get(name) ?? []).flatMap((v) => {
    if (/^#[0-9a-f]{3,6}$/i.test(v)) return [v];
    const ref = /^var\((--[\w-]+)\)$/.exec(v);
    return ref ? literals(ref[1], seen) : [];
  });
}

describe('text on a --presence fill', () => {
  it('derives its ink from the accent', () => {
    expect(rule).not.toBeNull();
    expect(tokens).toMatch(DERIVED);
  });

  it('keeps the derivation in one property every derived ink reads', () => {
    // The cut and the dark ink's lightness were once copied into 28 rules; a copy that drifts
    // would pick a different ink for the same fill.
    for (const { f, css } of sheets) {
      if (f.endsWith('tokens-base.css')) continue;
      expect(css, f).not.toMatch(/-\s*l\)\s*\*\s*1000/);
      for (const [expr] of css.matchAll(/color:\s*oklch\(\s*from[^;]*;/g)) {
        expect(expr, f).toMatch(/var\(--ink-on-fill\)\s*\)\s*;$/);
      }
    }
  });

  it('clears 4.5:1 on every accent any stylesheet declares', () => {
    const [, darkInkL, threshold] = rule!;
    // An achromatic OKLab lightness L has relative luminance L³.
    const darkInk = Number(darkInkL) ** 3;
    const accents = [...new Set(literals('--presence'))];
    // The Study's amber arrives through --study-amber, so it is only found by following var().
    expect(accents).toContain('#d98f45');
    expect(accents.length).toBeGreaterThan(10);
    for (const hex of accents) {
      const rgb = parseHex(hex);
      const ink = oklabL(rgb) < Number(threshold) ? 1 : darkInk;
      expect(contrast(luminance(rgb), ink), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is restated wherever --presence is rebound below the root', () => {
    // A custom property resolves where it is declared, so the root's --on-presence was derived
    // from the root's accent; a scope with its own accent must derive its own ink.
    for (const { f, css } of sheets) {
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*--presence:[^{}]*)\}/g)) {
        const sel = selector.trim().split('\n').pop()!.trim();
        if (sel.startsWith(':root')) continue;
        const restated = new RegExp(
          `${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*--on-presence:`,
        );
        expect(restated.test(css), `${f} ${sel}`).toBe(true);
        expect(css, f).toMatch(DERIVED);
        void body;
      }
    }
  });

  it('never sets white on an accent fill without deriving the ink', () => {
    const accentFilled = new Map<string, Set<string>>();
    for (const { f, css } of sheets) {
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/background(?:-color|-image)?:[^;]*var\(--(presence|accent)\b/.test(body)) {
          const set = accentFilled.get(f) ?? new Set<string>();
          set.add(selector.split('*/').pop()!.trim());
          accentFilled.set(f, set);
        }
      }
    }
    // A rule filled from the accent (solid, mixed or a gradient) reads --on-presence, or keeps
    // white only as the fallback beneath an @supports rule that derives its ink from its own fill.
    const offenders: string[] = [];
    for (const { f, css } of sheets) {
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/(?<![-\w])color:\s*(#fff\b|#ffffff\b|white\b)/i.test(body)) continue;
        const fills = [...body.matchAll(/background(?:-color|-image)?:\s*([^;]*)/gi)].map(
          (m) => m[1],
        );
        const state = selector.split('*/').pop()!.trim();
        // A :hover / :focus / :active / attribute variant of an accent-filled control paints on
        // that same fill, and it outranks the base rule's derived ink.
        const base = state.replace(/(:[\w-]+(\([^)]*\))?|\[[^\]]*\])+$/, '');
        if (base !== state && accentFilled.get(f)?.has(base)) {
          offenders.push(`${f} ${state}`);
          continue;
        }
        if (!fills.some((b) => /var\(--(presence|accent)\b/.test(b))) continue;
        const sel = selector.split('*/').pop()!.trim();
        const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const derived = new RegExp(
          `@supports[^{]*\\{\\s*${escaped}\\s*\\{\\s*color:\\s*oklch\\(\\s*from`,
        );
        if (!derived.test(css)) offenders.push(`${f} ${sel}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('text on a two-stop gradient', () => {
  const [, darkInkL, threshold] = rule!;
  const shadeL = Number(/--avatar-shade-l:\s*([\d.]+)/.exec(tokens)?.[1]);
  /** The ink a rule derives from its gradient's midpoint, and its contrast at every stop. */
  const atStops = (stops: Lab[]) => {
    const mid = stops[0].map((v, i) => (v + stops.at(-1)![i]) / 2) as Lab;
    const ink = mid[0] < Number(threshold) ? 1 : Number(darkInkL) ** 3;
    return stops.map((stop) => contrast(luminance(fromOklab(stop)), ink));
  };
  /** color-mix(in oklab, accent p%, black), its lightness raised to the avatar shade floor. */
  const shade = (accent: Lab, p: number): Lab => [
    Math.max(accent[0] * p, shadeL),
    accent[1] * p,
    accent[2] * p,
  ];
  const personas = [...read('src/demo/cast.ts').matchAll(/accent:\s*'(#[0-9a-f]{6})'/gi)].map(
    (m) => m[1],
  );

  it('keeps an avatar initial legible at both ends of its gradient', () => {
    expect(shadeL).toBeGreaterThan(0);
    expect(personas.length).toBeGreaterThan(2);
    // The replay's avatar gradient, as its stylesheet declares it.
    const demo = read('src/demo/demo.css');
    expect(demo).toMatch(
      /var\(--accent\) 55%, #000\)\s+max\(l, var\(--avatar-shade-l\)\) c h\s*\)/,
    );
    for (const hex of personas) {
      const accent = toOklab(parseHex(hex));
      for (const ratio of atStops([accent, shade(accent, 0.55)])) {
        expect(ratio, hex).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
