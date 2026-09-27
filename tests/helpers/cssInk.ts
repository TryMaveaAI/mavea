// A small evaluator for the colour side of the stylesheets, so a contrast check can run over every
// rule rather than a hand-picked list. It reads enough of CSS to say what a control paints in each
// skin: a cascade by specificity and source order (files in the order the app imports them),
// selectors matched a compound at a time (a base class reaches its state and modifier variants, a
// descendant rule reaches the fill it sits in), custom properties resolved at the element that
// declares them, @media and @supports, and the colour functions the sheets use — color-mix,
// relative oklch and srgb-linear with calc/min/max/clamp/sign, gradients, and the filter and
// opacity a hover applies to fill and ink alike.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export type Rgba = [number, number, number, number]; // linear sRGB + alpha

/** An element below the root that restates tokens, and what the markup sets inline on it. */
export interface Host {
  selector: string;
  inline?: Record<string, string>;
  name?: string;
}

export interface Scope {
  template: string | null;
  theme: 'dark' | 'light';
  host: Host | null;
}

/** One compound selector: its simple selectors and the pseudo-element it ends in, if any. */
export interface Compound {
  simples: string[];
  pseudo: string;
}

export interface Rule {
  file: string;
  /** Position in the cascade: the file's import order, then source order. */
  order: number;
  selector: string;
  /** The root condition the selector opens with (`:root[data-theme='light']`), and the rest. */
  cond: string;
  rest: string;
  path: Compound[];
  specificity: number;
  decls: Map<string, string>;
  /** Inside an @supports block (the relative-colour path every current browser takes). */
  supports: boolean;
  /** The @media / @container conditions the rule sits under. */
  media: string[];
}

// ── reading the sheets ──────────────────────────────────────────────────────────────────────

/** Split on a separator that is not inside parentheses or brackets. */
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

const PSEUDO_ELEMENT =
  /^::?(before|after|placeholder|marker|selection|first-line|first-letter|backdrop|file-selector-button)$/;

function parseCompound(step: string): Compound {
  const tokens =
    step.match(
      /::?[\w-]+(?:\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]|\*|[\w-]+/g,
    ) ?? [];
  let pseudo = '';
  const simples: string[] = [];
  for (const t of tokens) {
    if (PSEUDO_ELEMENT.test(t)) pseudo = t.replace(/^:+/, '::');
    else if (t !== '*') simples.push(t.replace(/"/g, "'"));
  }
  return { simples, pseudo };
}

/** A selector (without its root condition) as compounds; combinators read as descendant steps. */
export function parsePath(rest: string): Compound[] {
  if (!rest) return [];
  const flat = rest.replace(/\s*[>+~]\s*(?![^[]*\])(?![^(]*\))/g, ' ');
  return splitTop(flat, ' ').filter(Boolean).map(parseCompound);
}

/** The root-level condition a selector opens with, and what follows it. */
export function splitRoot(selector: string): { cond: string; rest: string } {
  const m = /^((?::root|html)?(?:\[[^\]]*\]|:not\(\[[^\]]*\]\))*)(\s+|$)/.exec(selector);
  if (!m || !m[1] || !/^(:root|html|\[)/.test(m[1])) return { cond: '', rest: selector };
  return { cond: m[1], rest: selector.slice(m[0].length).trim() };
}

export function specificity(selector: string): number {
  const s = selector
    .replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/:(not|is|has)\(/g, ' (');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):(?!:)[\w-]+/g) ?? []).length;
  const types = (s.match(/::[\w-]+|(?:^|[\s(])[a-z][\w-]*/gi) ?? []).length;
  return ids * 1e4 + classes * 1e2 + types;
}

/** Every style rule of one stylesheet, one entry per selector in a list. */
export function parseSheet(file: string, source: string, fileOrder = 0): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const frames: { kind: 'supports' | 'media' | 'dead' | 'other'; prelude: string }[] = [];
  let start = 0;
  let n = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === ';') start = i + 1;
    else if (ch === '}') {
      frames.pop();
      start = i + 1;
    } else if (ch === '{') {
      const prelude = css.slice(start, i).trim();
      start = i + 1;
      if (prelude.startsWith('@')) {
        const kind = /^@supports\s+not\b/.test(prelude)
          ? 'dead'
          : prelude.startsWith('@supports')
            ? 'supports'
            : /^@(media|container)\b/.test(prelude)
              ? 'media'
              : /^@(keyframes|font-face|page|property|counter-style)\b/.test(prelude)
                ? 'dead'
                : 'other';
        frames.push({ kind, prelude: prelude.replace(/^@(media|container)\s*/, '') });
        continue;
      }
      // A style rule: its body runs to the matching brace.
      let depth = 1;
      let j = i + 1;
      for (; j < css.length && depth; j++) {
        if (css[j] === '{') depth++;
        if (css[j] === '}') depth--;
      }
      const body = css.slice(i + 1, j - 1).replace(/\{[^{}]*\}/g, '');
      i = j - 1;
      start = j;
      if (frames.some((f) => f.kind === 'dead')) continue;
      const decls = new Map<string, string>();
      for (const d of splitTop(body, ';')) {
        const at = d.indexOf(':');
        if (at > 0) decls.set(d.slice(0, at).trim(), d.slice(at + 1).trim());
      }
      for (const raw of splitTop(prelude)) {
        const selector = raw.replace(/\s+/g, ' ');
        const { cond, rest } = splitRoot(selector);
        rules.push({
          file,
          order: fileOrder * 1e5 + n++,
          selector,
          cond,
          rest,
          path: parsePath(rest),
          specificity: specificity(selector),
          decls,
          supports: frames.some((f) => f.kind === 'supports'),
          media: frames.filter((f) => f.kind === 'media').map((f) => f.prelude),
        });
      }
    }
  }
  return rules;
}

function resolveImport(from: string, spec: string): string | null {
  const base = normalize(join(dirname(from), spec));
  for (const p of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** The stylesheets in the order the app puts them in the document: a depth-first walk of the
 *  static imports from the entry (a sheet's own @imports first), then each lazily imported module
 *  in turn. Sheets nothing reaches (dev-only surfaces) follow, alphabetically. */
export function sheetOrder(root = 'src', entry = 'src/main.tsx'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const later: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    if (file.endsWith('.css')) {
      for (const [, spec] of src.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
        const p = resolveImport(file, spec);
        if (p) visit(p);
      }
      out.push(file);
      return;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    for (const m of code.matchAll(
      /\bimport\s+(type\s+)?(?:[\w*{}\s,]+?\s+from\s+)?['"]([^'"]+)['"]|\bexport\s+(type\s+)?[\w*{}\s,]+?\s+from\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      if (m[1] || m[3]) continue; // types only: nothing loads
      const spec = m[2] ?? m[4] ?? m[5];
      if (!spec.startsWith('.') || spec.includes('?')) continue;
      const p = resolveImport(file, spec);
      if (!p) continue;
      if (m[5]) later.push(p);
      else visit(p);
    }
  };
  visit(entry);
  while (later.length) visit(later.shift()!);
  const all = (function walk(dir: string): string[] {
    return readdirSync(dir)
      .sort()
      .flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : [];
      });
  })(root);
  return [...out, ...all.filter((f) => !out.includes(f))];
}

/** Every style rule of every stylesheet, in cascade order. */
export function readRules(root = 'src'): Rule[] {
  return sheetOrder(root).flatMap((file, i) => parseSheet(file, readFileSync(file, 'utf8'), i + 1));
}

/** Every custom property the app's markup sets inline, so a fill read from one is judged as any
 *  colour the markup could set. */
export function markupVars(root = 'src'): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p))
        for (const m of readFileSync(p, 'utf8').matchAll(
          /['"`](--[\w-]+)['"`](?:\s+as\s+\w+)?\s*[\]:,]/g,
        ))
          out.add(m[1]);
    }
  };
  walk(root);
  return out;
}

/** Every template the stylesheet skins, so a new one is judged the day it lands. */
export const TEMPLATES = [
  ...new Set(
    [...readFileSync('src/styles/templates.css', 'utf8').matchAll(/data-template='([\w-]+)'/g)].map(
      (m) => m[1],
    ),
  ),
];

export const STUDY: Host = { selector: '.study-stage', name: 'study' };

export const SCOPES: Scope[] = [null, ...TEMPLATES].flatMap((template) =>
  (['dark', 'light'] as const).flatMap((theme) => [
    { template, theme, host: null },
    { template, theme, host: STUDY },
  ]),
);

export const scopeName = (s: Scope) =>
  `${s.template ?? 'stock'}/${s.theme}${s.host ? '/' + (s.host.name ?? s.host.selector) : ''}`;

/** Does a root condition hold in this scope? Attributes other than template/theme never do. */
const conditions = new Map<string, [not: boolean, name: string, value?: string][]>();

export function rootMatches(cond: string, s: Scope): boolean {
  let parsed = conditions.get(cond);
  if (!parsed) {
    parsed = [...cond.matchAll(/(:not\()?\[([\w-]+)(?:=['"]?([\w-]+)['"]?)?\]\)?/g)].map(
      ([, not, name, value]) => [!!not, name, value],
    );
    conditions.set(cond, parsed);
  }
  for (const [not, name, value] of parsed) {
    let hit: boolean;
    if (name === 'data-template') hit = value ? s.template === value : s.template !== null;
    else if (name === 'data-theme') hit = value ? s.theme === value : true;
    else hit = false;
    if (not ? hit : !hit) return false;
  }
  return true;
}

// ── selector matching ───────────────────────────────────────────────────────────────────────

/** A `:not()` / `:is()` / `:where()` simple, parsed once: its kind and each alternative's simples. */
const functional = new Map<string, { not: boolean; alts: string[][] } | null>();
function functionalOf(s: string) {
  let parsed = functional.get(s);
  if (parsed === undefined) {
    const fn = /^:(not|is|where)\(([\s\S]*)\)$/.exec(s);
    parsed = fn
      ? { not: fn[1] === 'not', alts: splitTop(fn[2]).map((alt) => parseCompound(alt).simples) }
      : null;
    functional.set(s, parsed);
  }
  return parsed;
}

function compoundApplies(r: Compound, t: Compound): boolean {
  if (r.pseudo !== t.pseudo) return false;
  for (const s of r.simples) {
    const fn = functionalOf(s);
    if (fn) {
      const hit = fn.alts.some((alt) => alt.every((x) => t.simples.includes(x)));
      if (fn.not ? hit : !hit) return false;
    } else if (!t.simples.includes(s)) return false;
  }
  return true;
}

/** Can a rule with this path select the element at the end of `target`? */
export function pathApplies(rule: Compound[], target: Compound[]): boolean {
  if (!rule.length || rule.length > target.length) return false;
  if (!compoundApplies(rule[rule.length - 1], target[target.length - 1])) return false;
  let j = target.length - 2;
  for (let i = rule.length - 2; i >= 0; i--) {
    while (j >= 0 && !compoundApplies(rule[i], target[j])) j--;
    if (j < 0) return false;
    j--;
  }
  return true;
}

const keyOf = (c: Compound) =>
  c.simples.find((s) => s.startsWith('.')) ??
  c.simples.find((s) => s.startsWith('#') || s.startsWith('[') || /^[a-z]/i.test(s)) ??
  '*';

// ── colour math ─────────────────────────────────────────────────────────────────────────────

export const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const toGamma = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;

export function toOklab([r, g, b]: Rgba | [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const clip = (v: number) => Math.min(1, Math.max(0, v));

export function fromOklab(L: number, a: number, b: number, alpha = 1): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha,
  ];
}

export const luminance = ([r, g, b]: Rgba | [number, number, number]) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

export const contrast = (x: Rgba, y: Rgba) => {
  const a = luminance(x);
  const b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Source-over in gamma sRGB, as a browser composites: `top` at `alpha` over `under`. */
export function over(top: Rgba, under: Rgba, alpha = top[3]): Rgba {
  const mix = (i: number) => toLinear(toGamma(top[i]) * alpha + toGamma(under[i]) * (1 - alpha));
  return [mix(0), mix(1), mix(2), 1];
}

/** The colour filter functions a hover or a disabled state uses, applied as Chrome does. */
export function applyFilter(c: Rgba, filter: string | undefined): Rgba {
  if (!filter || filter === 'none') return c;
  let [r, g, b] = [toGamma(c[0]), toGamma(c[1]), toGamma(c[2])];
  for (const [, fn, arg] of filter.matchAll(/([\w-]+)\(\s*([\d.]+%?)\s*\)/g)) {
    const k = arg.endsWith('%') ? parseFloat(arg) / 100 : parseFloat(arg);
    if (fn === 'brightness') [r, g, b] = [r * k, g * k, b * k].map(clip);
    else if (fn === 'contrast') [r, g, b] = [r, g, b].map((v) => clip((v - 0.5) * k + 0.5));
    else if (fn === 'saturate' || fn === 'grayscale') {
      const s = fn === 'saturate' ? k : 1 - Math.min(1, k);
      [r, g, b] = [
        clip((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
        clip((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
        clip((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
      ];
    }
  }
  return [toLinear(r), toLinear(g), toLinear(b), c[3]];
}

const NAMED: Record<string, Rgba> = {
  white: [1, 1, 1, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

function parseHex(h: string): Rgba {
  const x = h.length <= 5 ? [...h.slice(1)].map((c) => c + c).join('') : h.slice(1);
  const n = (i: number) => parseInt(x.slice(i, i + 2), 16) / 255;
  return [toLinear(n(0)), toLinear(n(2)), toLinear(n(4)), x.length === 8 ? n(6) : 1];
}

/** Evaluate a channel expression over the origin's channels (and numbers), as relative colour
 *  allows. */
export function evalExpr(src: string, env: Record<string, number>): number {
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
    if (t === '+') return primary();
    if (/^[\d.]+%$/.test(t)) return parseFloat(t) / 100;
    if (/^[\d.]+$/.test(t)) return parseFloat(t);
    if (t === 'none') return 0;
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
      // clamp(MIN, VAL, MAX) is max(MIN, min(VAL, MAX)): MIN wins when the bounds cross.
      if (t === 'clamp') return Math.max(args[0], Math.min(args[1], args[2]));
      if (t === 'sign') return Math.sign(args[0]);
      if (t === 'abs') return Math.abs(args[0]);
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
  const v = sum();
  return Number.isNaN(v) ? 0 : v; // CSS censors a NaN calculation to zero
}

/** The origin of a relative colour (the first top-level token after `from`) and the rest. */
function relative(body: string): { origin: Rgba; channels: string[]; alpha: string | null } {
  const rest = body.replace(/^\s*from\s+/, '');
  let depth = 0;
  let k = 0;
  for (; k < rest.length; k++) {
    if (rest[k] === '(') depth++;
    if (rest[k] === ')') depth--;
    if (/\s/.test(rest[k]) && depth === 0) break;
  }
  const [chans, alpha] = splitTop(rest.slice(k).trim(), '/');
  return {
    origin: parseColor(rest.slice(0, k)),
    channels: splitTop(chans, ' ').filter(Boolean),
    alpha: alpha ?? null,
  };
}

export function parseColor(v: string): Rgba {
  v = v.trim();
  if (v.startsWith('#')) return parseHex(v);
  if (v.toLowerCase() in NAMED) return NAMED[v.toLowerCase()];
  const fn = /^([\w-]+)\(([\s\S]*)\)$/.exec(v);
  if (!fn) throw new Error(`colour: ${v}`);
  const [, name, body] = fn;
  if (name === 'rgb' || name === 'rgba') {
    const p = body.split(/[\s,/]+/).filter(Boolean);
    const ch = (x: string) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x) / 255);
    const a = p[3] ? (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    return [toLinear(ch(p[0])), toLinear(ch(p[1])), toLinear(ch(p[2])), a];
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
    if (/srgb-linear/.test(space)) {
      const mixc = (i: number) => (ca[i] * ca[3] * pa + cb[i] * cb[3] * pb) / alpha;
      return [mixc(0), mixc(1), mixc(2), alpha * alphaScale];
    }
    if (/srgb/.test(space)) {
      const mixc = (i: number) =>
        toLinear((toGamma(ca[i]) * ca[3] * pa + toGamma(cb[i]) * cb[3] * pb) / alpha);
      return [mixc(0), mixc(1), mixc(2), alpha * alphaScale];
    }
    const la = toOklab(ca);
    const lb = toOklab(cb);
    const mix = (i: number) => (la[i] * ca[3] * pa + lb[i] * cb[3] * pb) / alpha;
    return fromOklab(mix(0), mix(1), mix(2), alpha * alphaScale);
  }
  if (name === 'oklch' && /^\s*from\s/.test(body)) {
    const { origin, channels, alpha } = relative(body);
    const [L, A, B] = toOklab(origin);
    const env = {
      l: L,
      c: Math.hypot(A, B),
      h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
      alpha: origin[3],
    };
    const [nl, nc, nh] = channels.map((c) => evalExpr(c, env));
    const hr = (nh * Math.PI) / 180;
    return fromOklab(
      clip(nl),
      Math.max(0, nc) * Math.cos(hr),
      Math.max(0, nc) * Math.sin(hr),
      alpha ? evalExpr(alpha, env) : origin[3],
    );
  }
  if (name === 'color') {
    const space = /^\s*from\s/.test(body) ? null : body.trim().split(/\s+/)[0];
    if (space === null) {
      const { origin, channels, alpha } = relative(body);
      const [target, ...chans] = channels;
      const gamma = target === 'srgb';
      if (target !== 'srgb' && target !== 'srgb-linear')
        throw new Error(`color() space: ${target}`);
      const o = gamma ? origin.map(toGamma) : origin;
      const env = { r: o[0], g: o[1], b: o[2], alpha: origin[3] };
      const out = chans.map((c) => clip(evalExpr(c, env)));
      const lin = gamma ? out.map(toLinear) : out;
      return [lin[0], lin[1], lin[2], alpha ? evalExpr(alpha, env) : origin[3]];
    }
    const [, ...nums] = body.trim().split(/[\s/]+/);
    const x = nums.map(parseFloat);
    const lin = space === 'srgb' ? x.slice(0, 3).map(toLinear) : x.slice(0, 3);
    if (space !== 'srgb' && space !== 'srgb-linear') throw new Error(`color() space: ${space}`);
    return [lin[0], lin[1], lin[2], x[3] ?? 1];
  }
  if (name === 'oklch') {
    const [l, c, h] = body
      .split(/[\s/]+/)
      .map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)));
    const hr = (h * Math.PI) / 180;
    return fromOklab(l, c * Math.cos(hr), c * Math.sin(hr));
  }
  throw new Error(`colour function: ${name}`);
}

/** The colours a background paints: a solid fill, or every stop of every gradient layer. */
export function fillStops(value: string): string[] {
  return splitTop(value).flatMap((layer) => {
    // A layer is its image or colour plus position, size, repeat and box keywords.
    const words = splitTop(layer.trim(), ' ');
    const image = words.find((w) => /^(?:repeating-)?(linear|radial|conic)-gradient\(/.test(w));
    const g = image && /^(?:repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/.exec(image);
    if (!g) {
      const colour = words.filter((w) =>
        /^(#|rgba?\(|oklch\(|color(-mix)?\(|var\(|hsla?\(|white$|black$|transparent$)/.test(w),
      );
      return colour.length ? [colour[colour.length - 1]] : [];
    }
    const parts = splitTop(g[2]);
    if (/^(to\s|[\d.]+(deg|turn|rad)|circle|ellipse|at\s|from\s|closest|farthest)/.test(parts[0]))
      parts.shift();
    return parts.map((p) => p.replace(/(\s+-?[\d.]+(%|px|deg))+$/, '').trim());
  });
}

// ── the cascade ─────────────────────────────────────────────────────────────────────────────

/** Which conditional rules hold: the scope, plus at most one @media / @container condition a
 *  check is run under. The defaults are the common case: motion allowed, a mouse. */
export interface Context {
  scope: Scope;
  media: string | null;
}

export function mediaHolds(conds: string[], ctx: Context): boolean {
  return conds.every((c) => {
    const scheme = /prefers-color-scheme:\s*(dark|light)/.exec(c);
    if (scheme) return scheme[1] === ctx.scope.theme;
    if (/\bprint\b|forced-colors/.test(c)) return false;
    if (/^\(?(prefers-reduced-motion:\s*no-preference|hover:\s*hover|pointer:\s*fine)\)?$/.test(c))
      return true;
    return c === ctx.media;
  });
}

/** A condition a check should also be run under, rather than one that holds by default. */
export const isVariantMedia = (c: string) =>
  !/prefers-color-scheme|\bprint\b|forced-colors/.test(c) &&
  !/^\(?(prefers-reduced-motion:\s*no-preference|hover:\s*hover|pointer:\s*fine)\)?$/.test(c);

/** A per-card colour the markup sets inline (`--nav-c`, `--bg-c`): any value, so it is judged
 *  as each skin's accent and its second hue in turn. */
const PER_CARD = /^--(?:[\w-]+-)?c$/;

export class Resolver {
  private byKey = new Map<string, Rule[]>();
  private byVar = new Map<string, Rule[]>();
  readonly declared = new Set<string>();
  /** Properties the markup sets inline somewhere (`style={{ '--pc': … }}`). */
  readonly markup: Set<string>;
  private inline: Record<string, string> = {};
  private standIn = 'var(--presence)';
  usedStandIn = false;

  constructor(rules: Rule[], markup: Set<string> = new Set()) {
    // A global token the markup rebinds (an embed's --presence) is still the token; only a
    // property no root rule declares is the markup's own colour.
    const global = new Set(rules.filter((r) => !r.path.length).flatMap((r) => [...r.decls.keys()]));
    this.markup = new Set([...markup].filter((n) => !global.has(n)));
    for (const r of rules) {
      const key = r.path.length ? keyOf(r.path[r.path.length - 1]) : '';
      if (r.path.length) {
        const list = this.byKey.get(key);
        if (list) list.push(r);
        else this.byKey.set(key, [r]);
      }
      for (const name of r.decls.keys()) {
        if (!name.startsWith('--')) continue;
        this.declared.add(name);
        const list = this.byVar.get(name);
        if (list) list.push(r);
        else this.byVar.set(name, [r]);
      }
    }
  }

  /** The same stylesheets, seen from an element given these properties inline, and with the
   *  per-card and undeclared colours standing in for `standIn`. */
  on(inline: Record<string, string>, standIn = 'var(--presence)'): Resolver {
    const r = Object.create(this) as Resolver;
    r.inline = inline;
    r.standIn = standIn;
    r.usedStandIn = false;
    return r;
  }

  /** The rules whose last compound could select the element at the end of `path`. */
  candidates(path: Compound[]): Rule[] {
    const last = path[path.length - 1];
    const out = [...(this.byKey.get('*') ?? [])];
    for (const s of new Set(last.simples)) out.push(...(this.byKey.get(s) ?? []));
    return out;
  }

  /** The winning declaration of any of `props` for the element at the end of `path`. */
  winner(props: string[], path: Compound[], ctx: Context): { rule: Rule; value: string } | null {
    let best: { rule: Rule; value: string } | null = null;
    for (const rule of this.candidates(path)) {
      const prop = props.find((p) => rule.decls.has(p));
      if (!prop || !rootMatches(rule.cond, ctx.scope) || !mediaHolds(rule.media, ctx)) continue;
      if (!pathApplies(rule.path, path)) continue;
      if (
        !best ||
        rule.specificity > best.rule.specificity ||
        (rule.specificity === best.rule.specificity && rule.order > best.rule.order)
      )
        best = { rule, value: rule.decls.get(prop)! };
    }
    return best;
  }

  /** The elements a custom property is looked up on, nearest first: the element (and, for a
   *  pseudo-element, the element it belongs to), its ancestors, then the root. */
  private chain(path: Compound[]): Compound[][] {
    const out: Compound[][] = [];
    if (path.length && path[path.length - 1].pseudo) {
      out.push(path);
      path = [...path.slice(0, -1), { ...path[path.length - 1], pseudo: '' }];
    }
    for (let n = path.length; n > 0; n--) out.push(path.slice(0, n));
    return out;
  }

  private lookup(name: string, chain: Compound[][], from: number, ctx: Context) {
    for (let i = from; i < chain.length; i++) {
      if (i === 0 && name in this.inline) return { value: this.inline[name], level: i };
      const p = chain[i];
      const host = ctx.scope.host;
      if (host?.inline && name in host.inline && p.length === 1 && i === chain.length - 1)
        return { value: host.inline[name], level: i };
      let best: Rule | null = null;
      for (const rule of this.byVar.get(name) ?? []) {
        if (!rule.path.length || !rootMatches(rule.cond, ctx.scope) || !mediaHolds(rule.media, ctx))
          continue;
        if (!pathApplies(rule.path, p)) continue;
        if (
          !best ||
          rule.specificity > best.specificity ||
          (rule.specificity === best.specificity && rule.order > best.order)
        )
          best = rule;
      }
      if (best) return { value: best.decls.get(name)!, level: i };
    }
    let best: Rule | null = null;
    for (const rule of this.byVar.get(name) ?? []) {
      if (rule.path.length || !rootMatches(rule.cond, ctx.scope) || !mediaHolds(rule.media, ctx))
        continue;
      if (
        !best ||
        rule.specificity > best.specificity ||
        (rule.specificity === best.specificity && rule.order > best.order)
      )
        best = rule;
    }
    if (best) return { value: best.decls.get(name)!, level: chain.length };
    // Declared on an element this path does not name (an ancestor the markup provides): the
    // latest such declaration in this scope.
    for (const rule of this.byVar.get(name) ?? []) {
      if (!rootMatches(rule.cond, ctx.scope) || !mediaHolds(rule.media, ctx)) continue;
      if (!best || rule.order > best.order) best = rule;
    }
    return best ? { value: best.decls.get(name)!, level: chain.length } : null;
  }

  /** Substitute every var() in a value, each resolved at the element that declared it. */
  substitute(value: string, path: Compound[], ctx: Context): string {
    const chain = this.chain(path);
    const run = (v: string, level: number, depth: number): string => {
      if (depth > 40) throw new Error(`var() cycle in ${value}`);
      let out = '';
      let i = 0;
      while (i < v.length) {
        const at = v.indexOf('var(', i);
        if (at === -1) {
          out += v.slice(i);
          break;
        }
        out += v.slice(i, at);
        let d = 0;
        let j = at + 3;
        for (; j < v.length; j++) {
          if (v[j] === '(') d++;
          if (v[j] === ')' && --d === 0) break;
        }
        const [rawName, ...fb] = splitTop(v.slice(at + 4, j));
        const name = rawName.trim();
        const hostInline = ctx.scope.host?.inline ?? {};
        const known = this.declared.has(name) || name in hostInline;
        // Set by the markup: per card, inline, or by nothing any stylesheet declares.
        const setInline = PER_CARD.test(name) || this.markup.has(name) || !known;
        const found = !setInline
          ? this.lookup(name, chain, level, ctx)
          : name in this.inline
            ? { value: this.inline[name], level: 0 }
            : name in hostInline
              ? { value: hostInline[name], level: chain.length - 1 }
              : null;
        if (found) out += run(found.value, found.level, depth + 1);
        else if (setInline) {
          this.usedStandIn = true;
          out += run(this.standIn, level, depth + 1);
        } else if (fb.length) out += run(fb.join(','), level, depth + 1);
        else throw new Error(`unresolved ${name}`);
        i = j + 1;
      }
      return out;
    };
    return run(value, 0, 0);
  }

  /** A colour value at an element, fully substituted, as linear sRGB + alpha. */
  color(value: string, ctx: Context, path: Compound[] = []): Rgba {
    const full = ctx.scope.host ? [...parsePath(ctx.scope.host.selector), ...path] : path;
    return parseColor(
      this.substitute(value, full.length ? full : [{ simples: [], pseudo: '' }], ctx),
    );
  }
}

// ── the audit ───────────────────────────────────────────────────────────────────────────────

const BG = ['background', 'background-color', 'background-image'];
/** A fill counts when it reads the accents (or an inverted text fill), a per-card colour, or a
 *  property no stylesheet declares — which the markup must be setting inline. */
const ACCENT_FILL = /var\(--(presence|accent|insight|study-amber|text-primary|text-secondary)\b/;
/** A tint of the page's own surface is still a surface: its text is ordinary text. */
const SURFACE = /var\(--(surface|bg|app-bg)\b/;
const TEXT_DECL = [
  'font-size',
  'text-anchor',
  'dominant-baseline',
  'font-weight',
  'letter-spacing',
];
/** Controls whose only content is an icon: WCAG's 3:1 for graphical objects applies. */
const BARE_VAR = /^var\(\s*--[\w-]+\s*(,[\s\S]*)?\)$/;
const opacityOf = (v: string | undefined) => {
  const n = v === undefined ? 1 : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
  return Number.isNaN(n) ? 1 : n;
};

/** The shapes a number or label is drawn on (`.pin-dot` under `.pin-num`), by name: a sibling
 *  that is a line, an arrowhead or another run of text is not under it. */
const SHAPE = /^\.[\w-]+-(dot|disc|circle|badge|bubble|pill|pip|bg|back|plate|fill)$/;
/** The text drawn ON such a shape rather than beside it: a number, an index, an initial. */
const LABEL_ON_SHAPE = /^\.[\w-]+-(num|count|idx|index|initial|letter|n)$/;
const ICON = /(^|[\s.])(ic|icon|svg|path)($|[\s.:[])|-ic\b|-icon\b/;

export interface Finding {
  where: string;
  ratio: number;
  floor: number;
}

export interface AuditOptions {
  scopes: Scope[];
  /** Accents the markup sets inline as --accent (the demo personas). */
  personas?: string[];
  /** Whether a rule from this file is painted in this scope. */
  paints?: (file: string, scope: Scope) => boolean;
  /** Controls judged at 3:1 regardless of their name. */
  iconOnly?: Set<string>;
  /** Custom properties the markup sets inline (`markupVars()`). */
  markup?: Set<string>;
}

export function auditInk(rules: Rule[], opts: AuditOptions) {
  const resolver = new Resolver(rules, opts.markup);
  const findings: Finding[] = [];
  let checked = 0;
  const vars = (v: string) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  const qualifies = (raw: string) =>
    ACCENT_FILL.test(raw) ||
    vars(raw).some((n) => PER_CARD.test(n) || resolver.markup.has(n) || !resolver.declared.has(n));

  // Every selector a rule names is an element some control can be; each is judged on the fill and
  // ink the whole cascade gives it, not on what that one rule says.
  const targets = new Map<string, { path: Compound[]; files: Set<string> }>();
  for (const r of rules) {
    if (!r.path.length) continue;
    const t = targets.get(r.rest) ?? { path: r.path, files: new Set<string>() };
    t.files.add(r.file);
    targets.set(r.rest, t);
  }
  // Rules that colour something inside a fill: `.box .ic`, `.b.on .label`.
  const inner = new Map<string, Rule[]>();
  for (const r of rules) {
    if (r.path.length < 2 || !(r.decls.has('color') || r.decls.has('fill'))) continue;
    const key = keyOf(r.path[r.path.length - 2]);
    inner.set(key, [...(inner.get(key) ?? []), r]);
  }
  // SVG text drawn over a sibling shape: `.an-pin-num` over `.an-pin-dot`, paired by their shared
  // stem. The stem has to name a part (`an-pin`), not just the family prefix: `.dst-idx` sits
  // under a cell while `.dst-dot` is a pointer elsewhere in the figure.
  const isText = (r: Rule) => TEXT_DECL.some((d) => r.decls.has(d));
  const svgText = rules.filter((r) => r.decls.has('fill') && isText(r));
  const stem = (c: string) => {
    const s = c.replace(/-[^-]+$/, '');
    return s.includes('-') ? s : null;
  };

  const judge = (
    where: string,
    fillRaw: string,
    fillPath: Compound[],
    inks: { raw: string; path: Compound[]; floor: number; label: string }[],
    ctx: Context,
    host: Compound[],
  ) => {
    const personaList = /var\(--accent\b/.test(fillRaw + inks.map((i) => i.raw).join(''))
      ? (opts.personas ?? [])
      : [null];
    for (const persona of personaList) {
      for (const standIn of ['var(--presence)', 'var(--insight)']) {
        const on = resolver.on(persona ? { '--accent': persona } : {}, standIn);
        const at = (p: Compound[]) => [...host, ...p];
        try {
          const filter = resolver.winner(['filter'], at(fillPath), ctx)?.value;
          const opacity = opacityOf(resolver.winner(['opacity'], at(fillPath), ctx)?.value);
          if (opacity < 0.05) continue; // hidden until a state shows it, and judged there
          const under = on.color('var(--surface-default)', ctx);
          const paint = (c: Rgba) => {
            const f = applyFilter(c, filter);
            return opacity < 1 ? over(f, under, opacity) : f;
          };
          // A surface is recognised by name before its tokens are substituted: an embed's
          // surfaces are opaque paper, and a tint of one is still a surface.
          const stops = fillStops(fillRaw)
            .filter((raw) => !SURFACE.test(raw))
            .flatMap((raw) => fillStops(on.substitute(raw, at(fillPath), ctx)));
          for (const stop of stops) {
            if (!/#|rgb|oklch|color|\bwhite\b|\bblack\b/.test(stop)) continue;
            if (stop === 'transparent' || stop === 'none') continue;
            const fill = parseColor(stop);
            if (fill[3] < 0.95) continue; // a tint over whatever lies beneath, not a fill
            for (const ink of inks) {
              // An ink the markup sets inline beside its fill is a pair this cannot see.
              if (BARE_VAR.test(ink.raw)) {
                const probe = resolver.on({}, standIn);
                probe.substitute(ink.raw, at(ink.path), ctx);
                if (probe.usedStandIn) continue;
              }
              const text = parseColor(on.substitute(ink.raw, at(ink.path), ctx));
              if (text[3] === 0) continue;
              const inkOpacity = opacityOf(resolver.winner(['opacity'], at(ink.path), ctx)?.value);
              const drawn = over(text, fill, text[3] * (ink.path === fillPath ? 1 : inkOpacity));
              checked++;
              const ratio = contrast(paint(fill), paint(drawn));
              if (ratio < ink.floor)
                findings.push({
                  where: `${where}${ink.label} ${scopeName(ctx.scope)}${ctx.media ? ` @media ${ctx.media}` : ''}${persona ? ' ' + persona : ''}${on.usedStandIn ? ` [${standIn}]` : ''} @ ${stop}`,
                  ratio,
                  floor: ink.floor,
                });
            }
          }
        } catch (e) {
          // Anything the evaluator cannot read is a gap in it, and fails.
          findings.push({ where: `${where}: ${(e as Error).message}`, ratio: 0, floor: 0 });
        }
        if (!on.usedStandIn) break;
      }
    }
  };

  /** The ink an element inherits when nothing sets it: its originating element or ancestor's. */
  const inkAt = (path: Compound[], ctx: Context, host: Compound[], prop = 'color') => {
    let p = path;
    while (p.length) {
      const w = resolver.winner([prop], [...host, ...p], ctx);
      if (w && !/^(inherit|currentcolor|unset)$/i.test(w.value)) return { raw: w.value, path: p };
      if (w && prop !== 'color' && /currentcolor/i.test(w.value)) return inkAt(p, ctx, host);
      const last = p[p.length - 1];
      p = last.pseudo ? [...p.slice(0, -1), { ...last, pseudo: '' }] : p.slice(0, -1);
    }
    return null;
  };

  for (const [rest, { path, files }] of targets) {
    if (/:disabled|\[aria-disabled|\[disabled/.test(rest)) continue; // exempt from minimums
    const file = [...files][0];
    const hasFill = resolver
      .candidates(path)
      .some((r) => BG.some((p) => r.decls.has(p)) && pathApplies(r.path, path));
    const shapeClasses = path.at(-1)!.simples.filter((s) => SHAPE.test(s));
    const svg = svgText.filter((t) => {
      if (!files.has(t.file) || !shapeClasses.length) return false;
      const tc = t.path.at(-1)!.simples.filter((s) => s.startsWith('.'));
      return shapeClasses.some(
        (s) =>
          !tc.includes(s) &&
          tc.some((c) => LABEL_ON_SHAPE.test(c) && stem(c) !== null && stem(c) === stem(s)),
      );
    });
    if (!hasFill && !svg.length) continue;
    for (const scope of opts.scopes) {
      if (opts.paints && ![...files].some((f) => opts.paints!(f, scope))) continue;
      const host = scope.host ? parsePath(scope.host.selector) : [];
      const full = [...host, ...path];
      const media = new Set<string | null>([null]);
      for (const r of resolver.candidates(full))
        if (pathApplies(r.path, full)) r.media.filter(isVariantMedia).forEach((m) => media.add(m));
      for (const m of media) {
        const ctx = { scope, media: m };
        const bg = resolver.winner(BG, full, ctx);
        if (bg && qualifies(bg.value)) {
          const isIcon = path.at(-1)!.simples.some((c) => opts.iconOnly?.has(c));
          const inks: { raw: string; path: Compound[]; floor: number; label: string }[] = [];
          // The control's own ink counts when a rule sets it on the control; one it only inherits
          // is a dot's or a bar's, which draws no text.
          const own = resolver.winner(['color'], full, ctx) && inkAt(path, ctx, host);
          if (own) inks.push({ ...own, path, floor: isIcon ? 3 : 4.5, label: '' });
          const last = path[path.length - 1];
          const seen = new Set<string>();
          for (const s of new Set(['*', ...last.simples])) {
            for (const d of inner.get(s) ?? []) {
              if (!pathApplies(d.path.slice(0, -1), path)) continue;
              const child = [...path, d.path[d.path.length - 1]];
              const key = JSON.stringify(child);
              if (seen.has(key)) continue;
              seen.add(key);
              const childBg = resolver.winner(BG, [...host, ...child], ctx);
              if (childBg && !/transparent|none|inherit/.test(childBg.value)) continue;
              const name = d.path[d.path.length - 1].simples.join('');
              const floor = ICON.test(name) ? 3 : 4.5;
              for (const prop of ['color', 'fill']) {
                const w = resolver.winner([prop], [...host, ...child], ctx);
                if (!w || /^(none|inherit|unset)$/i.test(w.value)) continue;
                const ink = /currentcolor/i.test(w.value)
                  ? inkAt(child, ctx, host)
                  : { raw: w.value };
                if (ink)
                  inks.push({ raw: ink.raw, path: child, floor, label: ` ${name}(${prop})` });
              }
            }
          }
          if (inks.length) judge(`${file} ${rest}`, bg.value, path, inks, ctx, host);
        }
        const shape = resolver.winner(['fill'], full, ctx);
        if (shape && !/none|currentcolor|url/i.test(shape.value)) {
          for (const t of svg) {
            // The markup stamps a variant attribute on the shape and its label alike.
            const label = t.path[t.path.length - 1];
            const attrs = path.at(-1)!.simples.filter((x) => x.startsWith('['));
            const tp = [
              ...path.slice(0, -1),
              { ...label, simples: [...new Set([...label.simples, ...attrs])] },
            ];
            const ink = inkAt(tp, ctx, host, 'fill');
            if (!ink) continue;
            judge(
              `${file} ${rest}`,
              shape.value,
              path,
              [{ raw: ink.raw, path: tp, floor: 4.5, label: ` ${t.rest}(fill)` }],
              ctx,
              host,
            );
          }
        }
      }
    }
  }
  return { findings, checked };
}
