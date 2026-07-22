// Source-scan analyzer: find every string-literal ENUM prop on a Live-facing block and check
// whether the catalog teaches its values to the model (propHints). Used by the drift-guard test
// and runnable standalone (`node scripts/enum-coverage.mjs`) to print the current gap list.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS = join(ROOT, 'src/canvas/blocks');

/** Strip line + block comments so they never get mistaken for declarations. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Extract `{ ... }` body starting at the first `{` after `fromIdx`, brace-balanced. */
function braceBody(src, fromIdx) {
  const start = src.indexOf('{', fromIdx);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return { body: src.slice(start + 1, i), end: i };
    }
  }
  return null;
}

/** Split an interface body into top-level `name: type` members, respecting nested braces. */
function members(body) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === ';' && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const isLiteralUnion = (t) => /^\s*'[^']+'(\s*\|\s*'[^']+')*\s*$/.test(t.replace(/\[\]$/, ''));
const literalValues = (t) => [...t.matchAll(/'([^']+)'/g)].map((m) => m[1]);

// Gather everything across the families.
const enums = new Map(); // EnumName -> string[]
const interfaces = new Map(); // IfaceName -> [{ name, optional, type }]
const typeToProps = new Map(); // block type -> Props interface name

for (const fam of readdirSync(BLOCKS, { withFileTypes: true })) {
  if (!fam.isDirectory()) continue;
  const tf = join(BLOCKS, fam.name, 'types.ts');
  let raw;
  try {
    raw = stripComments(readFileSync(tf, 'utf8'));
  } catch {
    continue;
  }

  // 1) Named string-literal enum aliases.
  for (const m of raw.matchAll(/export type (\w+)\s*=\s*([^;]+);/g)) {
    if (isLiteralUnion(m[2])) enums.set(m[1], literalValues(m[2]));
  }

  // 2) Interfaces and their members.
  for (const m of raw.matchAll(/(?:export )?interface (\w+)\s*/g)) {
    const b = braceBody(raw, m.index + m[0].length);
    if (!b) continue;
    const props = [];
    for (const mem of members(b.body)) {
      const mm = mem.match(/^(\w+)(\??):\s*([\s\S]+)$/);
      if (mm) props.push({ name: mm[1], optional: mm[2] === '?', type: mm[3].trim() });
    }
    interfaces.set(m[1], props);
  }

  // 3) Discriminated-union members: block type -> Props interface.
  for (const m of raw.matchAll(/type:\s*'([a-z0-9]+)';\s*props:\s*(\w+)/g)) {
    typeToProps.set(m[1], m[2]);
  }
}

/** Walk an interface for enum-typed prop paths, recursing into named item interfaces. */
function enumPropsOf(ifaceName, prefix = '', seen = new Set(), depth = 0) {
  const found = [];
  if (depth > 4 || seen.has(ifaceName)) return found;
  seen = new Set(seen).add(ifaceName);
  const props = interfaces.get(ifaceName);
  if (!props) return found;
  for (const p of props) {
    const bare = p.type.replace(/\s*\|\s*undefined$/, '');
    const isArray = /\[\]$/.test(bare);
    const elem = bare.replace(/\[\]$/, '').trim();
    const path = `${prefix}${p.name}${isArray ? '[]' : ''}`;
    if (isLiteralUnion(p.type)) {
      found.push({ path: `${prefix}${p.name}`, values: literalValues(p.type) });
    } else if (enums.has(elem)) {
      found.push({ path: `${prefix}${p.name}`, values: enums.get(elem) });
    } else if (interfaces.has(elem)) {
      found.push(...enumPropsOf(elem, `${path}.`, seen, depth + 1));
    }
  }
  return found;
}

// The Live-facing types come from the catalog's RAW_CATALOG. Parse the type names + their
// propHints straight from the source (no TS execution needed).
const catSrc = stripComments(readFileSync(join(BLOCKS, 'catalog/catalog.data.ts'), 'utf8'));
const catalog = new Map(); // type -> { hintsText }
for (const m of catSrc.matchAll(/createMeta\(\s*'([a-z0-9]+)'\s*,\s*/g)) {
  const b = braceBody(catSrc, m.index + m[0].length);
  if (!b) continue;
  const ph = b.body.match(/propHints:\s*\{/);
  let hintsText = '';
  if (ph) {
    const hb = braceBody(b.body, ph.index + ph[0].length - 1);
    if (hb) hintsText = hb.body;
  }
  catalog.set(m[1], hintsText);
}

// Props intentionally NOT exposed, keyed `type:path`. These are enums the model either can't
// get wrong in a way that matters, or guesses correctly from universal knowledge — so teaching
// their values would only add prompt noise. Everything NOT here must be taught in propHints.
const ALLOW = new Set([
  // Universal chemistry the model already knows; the catalog steers hard to SMILES anyway.
  'molecularstructure:atoms[].el',
  // Direction of a delta/trend — up/down/flat is obvious and self-correcting from the number.
  'sparkstat:deltaDir',
  'counter:deltaDir',
  'herostat:trendDir',
  'trendtile:deltaDir',
  'scorecard:tiles[].deltaDir',
  'sparktable:rows[].deltaDir',
  'smallmultiples:panels[].deltaDir',
  'datatable:sortDir',
  // Position / alignment / anchor — left/right/top/bottom/start/middle/end are obvious, and a
  // wrong value just nudges placement; it never breaks or misleads.
  'diagram:labels[].side',
  'geometrycanvas:annotations[].anchor',
  'tooltip:targets[].placement',
  'datatable:columns[].align',
  // Size / orientation / interaction mode — obvious, low-cardinality, graceful default.
  'avatargroup:size',
  'stepindicator:orientation',
  'chipset:mode',
  'togglegroup:mode',
  'radiogroup:layout',
  'timepicker:meridiem',
  // Purely visual variants that fall back to a sensible default on a miss (no broken render).
  'network:layout',
  'smallmultiples:kind',
  'emptystate:art',
  'skeleton:variant',
  'ratinginput:shape',
]);

const gaps = [];
for (const [type, propsIface] of typeToProps) {
  if (!catalog.has(type)) continue; // not Live-facing
  const hints = catalog.get(type);
  for (const { path, values } of enumPropsOf(propsIface)) {
    if (ALLOW.has(`${type}:${path}`)) continue;
    // "Taught" = every value of the enum appears in this component's propHints text, so the
    // model sees the full menu. We don't require the exact path key (the catalog sometimes
    // writes a shorter path) — listing the values IS the teaching.
    const named = values.filter((v) => hints.includes(`'${v}'`) || hints.includes(`"${v}"`));
    const ok = named.length === values.length;
    if (!ok) gaps.push({ type, path, values, named: named.length });
  }
}

if (process.argv.includes('--print')) {
  console.log(`Live-facing types: ${[...typeToProps.keys()].filter((t) => catalog.has(t)).length}`);
  console.log(`Enums found: ${enums.size}, interfaces: ${interfaces.size}`);
  console.log(`\nGAPS (${gaps.length}):`);
  for (const g of gaps)
    console.log(
      `  ${g.type}.${g.path}  ->  ${g.values.join('|')}  (named ${g.named}/${g.values.length})`,
    );
}

export { gaps, typeToProps, catalog, enumPropsOf, enums };
