// A small evaluator for the colour side of the stylesheets: enough of CSS (custom properties
// across the root, template, theme and Study scopes; color-mix in oklab; relative oklch with
// clamp/min/max/calc; linear and radial gradients) to say what a rule actually paints in each
// skin, so a contrast check can run over every rule rather than a hand-picked list.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type Rgba = [number, number, number, number]; // linear sRGB + alpha

export interface Scope {
  template: string | null;
  theme: 'dark' | 'light';
  study: boolean;
}

export interface Rule {
  file: string;
  selector: string;
  decls: Map<string, string>;
  /** True inside an @supports block (the relative-colour path every current browser takes). */
  supports: boolean;
}

/** Every template the stylesheet skins, so a new one is judged the day it lands. */
export const TEMPLATES = [
  ...new Set(
    [...readFileSync('src/styles/templates.css', 'utf8').matchAll(/data-template='([\w-]+)'/g)].map(
      (m) => m[1],
    ),
  ),
];

export const SCOPES: Scope[] = [null, ...TEMPLATES].flatMap((template) =>
  (['dark', 'light'] as const).flatMap((theme) => [
    { template, theme, study: false },
    { template, theme, study: true },
  ]),
);

export const scopeName = (s: Scope) =>
  `${s.template ?? 'stock'}/${s.theme}${s.study ? '/study' : ''}`;

function cssFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
    });
}

/** Split on commas that are not inside parentheses. */
export function splitTop(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every innermost rule of every stylesheet, one entry per selector in a list. */
export function readRules(root = 'src'): Rule[] {
  const rules: Rule[] = [];
  for (const file of cssFiles(root)) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Track which blocks are @supports so a rule inside one is marked.
    const stack: boolean[] = [];
    let i = 0;
    let start = 0;
    while (i < css.length) {
      const ch = css[i];
      if (ch === '{') {
        const prelude = css.slice(start, i).trim();
        const close = css.indexOf('}', i);
        const nextOpen = css.indexOf('{', i + 1);
        if (close !== -1 && (nextOpen === -1 || close < nextOpen)) {
          // An innermost rule.
          const decls = new Map<string, string>();
          for (const d of splitTop(css.slice(i + 1, close), ';')) {
            const at = d.indexOf(':');
            if (at > 0) decls.set(d.slice(0, at).trim(), d.slice(at + 1).trim());
          }
          for (const selector of splitTop(prelude)) {
            rules.push({
              file,
              selector: selector.replace(/\s+/g, ' '),
              decls,
              supports: stack.includes(true),
            });
          }
          i = close + 1;
          start = i;
          continue;
        }
        stack.push(prelude.startsWith('@supports'));
        start = i + 1;
      } else if (ch === '}') {
        stack.pop();
        start = i + 1;
      } else if (ch === ';' && stack.length === 0) {
        start = i + 1; // @import and the like
      }
      i++;
    }
  }
  return rules;
}

/** The root-level condition a selector opens with, and what follows it. */
export function splitRoot(selector: string): { cond: string; rest: string } {
  const m = /^((?::root|html)?(?:\[[^\]]*\]|:not\(\[[^\]]*\]\))*)(\s+|$)/.exec(selector);
  if (!m || !m[1] || !/^(:root|html|\[)/.test(m[1])) return { cond: '', rest: selector };
  return { cond: m[1], rest: selector.slice(m[0].length).trim() };
}

/** Does a root condition hold in this scope? Attributes other than template/theme never do. */
export function rootMatches(cond: string, s: Scope): boolean {
  for (const [whole, not, name, value] of cond.matchAll(
    /(:not\()?\[([\w-]+)(?:=['"]?([\w-]+)['"]?)?\]\)?/g,
  )) {
    void whole;
    let hit: boolean;
    if (name === 'data-template') hit = value ? s.template === value : s.template !== null;
    else if (name === 'data-theme') hit = value ? s.theme === value : true;
    else hit = false;
    if (not ? hit : !hit) return false;
  }
  return true;
}

// ── colour math ─────────────────────────────────────────────────────────────────────────────

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function toOklab([r, g, b]: Rgba): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function fromOklab(L: number, a: number, b: number, alpha = 1): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha,
  ];
}

export const luminance = ([r, g, b]: Rgba) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const contrast = (x: Rgba, y: Rgba) => {
  const a = luminance(x);
  const b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const NAMED: Record<string, Rgba> = {
  white: [1, 1, 1, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

function parseHex(h: string): Rgba {
  const x = h.length <= 5 ? [...h.slice(1)].map((c) => c + c).join('') : h.slice(1);
  const n = (i: number) => parseInt(x.slice(i, i + 2), 16) / 255;
  return [lin(n(0)), lin(n(2)), lin(n(4)), x.length === 8 ? n(6) : 1];
}

/** Evaluate a channel expression over l/c/h (and numbers), as relative colour allows. */
function evalExpr(src: string, env: Record<string, number>): number {
  const toks = src.match(/[\d.]+%?|[a-z]+|[()+\-*/,]/gi) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const primary = (): number => {
    const t = next();
    if (t === '(') {
      const v = sum();
      next();
      return v;
    }
    if (t === '-') return -primary();
    if (/^[\d.]+%$/.test(t)) return parseFloat(t) / 100;
    if (/^[\d.]+$/.test(t)) return parseFloat(t);
    if (t in env && peek() !== '(') return env[t];
    if (peek() === '(') {
      next();
      const args = [sum()];
      while (peek() === ',') {
        next();
        args.push(sum());
      }
      next();
      if (t === 'calc') return args[0];
      if (t === 'min') return Math.min(...args);
      if (t === 'max') return Math.max(...args);
      if (t === 'clamp') return Math.min(Math.max(args[1], args[0]), args[2]);
    }
    throw new Error(`channel expression: ${src}`);
  };
  const product = (): number => {
    let v = primary();
    while (peek() === '*' || peek() === '/') v = next() === '*' ? v * primary() : v / primary();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + product() : v - product();
    return v;
  };
  return sum();
}

/** How specific a root condition is: each attribute test, :root and :not() count once. */
const weight = (cond: string) => (cond.match(/\[|:root/g) ?? []).length;

/** The declaration the cascade picks: the most specific matching condition, then the latest. */
function winner(decls: [string, string, string][], name: string, s: Scope) {
  let best: [string, string, string] | undefined;
  for (const d of decls) {
    if (d[1] !== name || !rootMatches(d[0], s)) continue;
    if (!best || weight(d[0]) >= weight(best[0])) best = d;
  }
  return best;
}

export class Resolver {
  private rootDecls: [string, string, string][] = []; // cond, name, value
  private studyDecls: [string, string, string][] = [];
  private localDecls: [string, string, string][] = []; // declared on some element
  private element: Record<string, string> = {};

  constructor(rules: Rule[]) {
    for (const r of rules) {
      const { cond, rest } = splitRoot(r.selector);
      for (const [name, value] of r.decls) {
        if (!name.startsWith('--')) continue;
        if (rest === '' && (cond || r.selector === ':root'))
          this.rootDecls.push([cond, name, value]);
        else if (rest === '.study-stage') this.studyDecls.push([cond, name, value]);
        else if (/^\.[\w-]+$/.test(rest)) this.localDecls.push([cond, name, value]);
      }
    }
  }

  /** The same stylesheets, seen from one element that sets (or is given) these properties. */
  on(element: Record<string, string>): Resolver {
    const r = Object.create(this) as Resolver;
    r.element = element;
    return r;
  }

  private lookup(
    name: string,
    s: Scope,
    level: 'element' | 'study' | 'root',
  ): [string, typeof level] | null {
    if (level === 'element') {
      if (name in this.element) return [this.element[name], 'element'];
      const local = winner(this.localDecls, name, s);
      if (local) return [local[2], 'element'];
      level = s.study ? 'study' : 'root';
    }
    if (level === 'study') {
      const d = winner(this.studyDecls, name, s);
      if (d) return [d[2], 'study'];
    }
    // Whatever the level asked for, the root is the last place a declaration can come from.
    const d = winner(this.rootDecls, name, s);
    return d ? [d[2], 'root'] : null;
  }

  /** Substitute every var() in a value, each resolved at the level that declared it. */
  substitute(
    value: string,
    s: Scope,
    level: 'element' | 'study' | 'root' = 'element',
    depth = 0,
  ): string {
    if (depth > 40) throw new Error(`var() cycle in ${value}`);
    let out = '';
    let i = 0;
    while (i < value.length) {
      const at = value.indexOf('var(', i);
      if (at === -1) {
        out += value.slice(i);
        break;
      }
      out += value.slice(i, at);
      let depthP = 0;
      let j = at + 3;
      for (; j < value.length; j++) {
        if (value[j] === '(') depthP++;
        if (value[j] === ')' && --depthP === 0) break;
      }
      const inner = value.slice(at + 4, j);
      const [name, ...fb] = splitTop(inner);
      const found = this.lookup(name.trim(), s, level);
      if (found) out += this.substitute(found[0], s, found[1], depth + 1);
      else if (fb.length) out += this.substitute(fb.join(','), s, level, depth + 1);
      else throw new Error(`unresolved ${name.trim()}`);
      i = j + 1;
    }
    return out;
  }

  /** A colour value, fully substituted, as linear sRGB + alpha. */
  color(value: string, s: Scope): Rgba {
    return parseColor(this.substitute(value, s));
  }
}

export function parseColor(v: string): Rgba {
  v = v.trim();
  if (v.startsWith('#')) return parseHex(v);
  if (v in NAMED) return NAMED[v];
  const fn = /^([\w-]+)\(([\s\S]*)\)$/.exec(v);
  if (!fn) throw new Error(`colour: ${v}`);
  const [, name, body] = fn;
  if (name === 'rgb' || name === 'rgba') {
    const p = body
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(parseFloat);
    return [lin(p[0] / 255), lin(p[1] / 255), lin(p[2] / 255), p[3] ?? 1];
  }
  if (name === 'color-mix') {
    const [space, a, b] = splitTop(body);
    if (!/oklab|srgb/.test(space)) throw new Error(`color-mix space: ${space}`);
    const part = (s: string) => {
      const m = /^([\s\S]*?)\s+([\d.]+)%$/.exec(s.trim());
      return m ? { c: m[1], p: parseFloat(m[2]) / 100 } : { c: s, p: NaN };
    };
    const A = part(a);
    const B = part(b);
    let pa = A.p;
    let pb = B.p;
    if (Number.isNaN(pa) && Number.isNaN(pb)) pa = pb = 0.5;
    else if (Number.isNaN(pa)) pa = 1 - pb;
    else if (Number.isNaN(pb)) pb = 1 - pa;
    const sumP = pa + pb;
    const alphaScale = sumP < 1 ? sumP : 1;
    pa /= sumP;
    pb /= sumP;
    const ca = parseColor(A.c);
    const cb = parseColor(B.c);
    const alpha = ca[3] * pa + cb[3] * pb;
    if (alpha === 0) return [0, 0, 0, 0];
    if (/srgb/.test(space)) {
      const mixc = (i: number) => (ca[i] * ca[3] * pa + cb[i] * cb[3] * pb) / alpha;
      return [mixc(0), mixc(1), mixc(2), alpha * alphaScale];
    }
    const la = toOklab(ca);
    const lb = toOklab(cb);
    const mix = (i: number) => (la[i] * ca[3] * pa + lb[i] * cb[3] * pb) / alpha;
    return fromOklab(mix(0), mix(1), mix(2), alpha * alphaScale);
  }
  if (name === 'oklch' && /^\s*from\s/.test(body)) {
    const rest = body.replace(/^\s*from\s+/, '');
    // The origin colour is the first top-level space-separated token.
    let depth = 0;
    let k = 0;
    for (; k < rest.length; k++) {
      if (rest[k] === '(') depth++;
      if (rest[k] === ')') depth--;
      if (/\s/.test(rest[k]) && depth === 0) break;
    }
    const origin = parseColor(rest.slice(0, k));
    const [L, A, B] = toOklab(origin);
    const env = { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
    const chans = splitTop(rest.slice(k).trim(), ' ').filter(Boolean);
    const [nl, nc, nh] = chans.map((c) => evalExpr(c, env));
    const hr = (nh * Math.PI) / 180;
    return fromOklab(
      Math.min(1, Math.max(0, nl)),
      Math.max(0, nc) * Math.cos(hr),
      Math.max(0, nc) * Math.sin(hr),
      origin[3],
    );
  }
  if (name === 'oklch') {
    const [l, c, h] = body
      .split(/\s+/)
      .map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)));
    const hr = (h * Math.PI) / 180;
    return fromOklab(l, c * Math.cos(hr), c * Math.sin(hr));
  }
  throw new Error(`colour function: ${name}`);
}

/** The colours a background paints: a solid fill, or every stop of a gradient. */
export function fillStops(value: string): string[] {
  const g = /^(?:repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/.exec(value.trim());
  if (!g) return [value.trim()];
  const parts = splitTop(g[2]);
  if (/^(to\s|[\d.]+(deg|turn|rad)|circle|ellipse|at\s|from\s|closest|farthest)/.test(parts[0]))
    parts.shift();
  return parts.map((p) => p.replace(/(\s+-?[\d.]+(%|px|deg))+$/, '').trim());
}
