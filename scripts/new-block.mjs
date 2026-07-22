#!/usr/bin/env node
// new-block.mjs — scaffold a new canvas block so adding one is a single command instead
// of six hand-edits. It creates the component + a CSS stub, then wires the block into the
// four places the protocol requires: the family `types.ts` (props interface + Block-union
// variant), the family `registry.tsx` (import + entry), and the `ComponentMeta` catalog
// (`catalog/catalog.data.ts`) so Live can select it.
//
// It edits a file ONLY when it finds that file's exact, standard anchor; otherwise it
// prints a ready-to-paste snippet for that one file and carries on — so a non-standard
// family file is never corrupted, just left to you. The block still needs a DEMO (a real
// instance in a src/data/topics/* spec): the canvas-render coverage test stays red until
// you add one, by design — see docs/ADDING-A-COMPONENT.md.
//
// Usage:  pnpm new:block <family> <type> [ComponentName]
//   pnpm new:block charts2 sparkline           -> component "Sparkline"
//   pnpm new:block code     syntaxbreakdown SyntaxBreakdown
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS = join(ROOT, 'src/canvas/blocks');

const fail = (msg) => {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const note = (msg) => console.log(`  ${msg}`);

// ── parse + validate args ───────────────────────────────────────────────────
const [family, type, nameArg] = process.argv.slice(2);
if (!family || !type) fail('usage: pnpm new:block <family> <type> [ComponentName]');
if (!/^[a-z][a-z0-9]*$/.test(type))
  fail(`type "${type}" must be a single lowercase word (the block's discriminant key)`);

const famDir = join(BLOCKS, family);
if (!existsSync(join(famDir, 'registry.tsx'))) {
  const families = readdirSync(BLOCKS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(BLOCKS, d.name, 'registry.tsx')))
    .map((d) => d.name)
    .sort()
    .join(', ');
  fail(`unknown family "${family}". Families: ${families}`);
}

const Comp = nameArg || type[0].toUpperCase() + type.slice(1);
if (!/^[A-Z][A-Za-z0-9]*$/.test(Comp)) fail(`ComponentName "${Comp}" must be PascalCase`);

const compPath = join(famDir, `${Comp}.tsx`);
const typesPath = join(famDir, 'types.ts');
const registryPath = join(famDir, 'registry.tsx');
const stylesPath = join(famDir, 'styles.css');
const catalogPath = join(BLOCKS, 'catalog/catalog.data.ts');

if (existsSync(compPath)) fail(`${Comp}.tsx already exists in ${family}/`);
if (new RegExp(`(^|[^A-Za-z0-9])${type}:`, 'm').test(readFileSync(registryPath, 'utf8')))
  fail(`block type "${type}" is already registered in ${family}/registry.tsx`);

const Props = `${Comp}Props`;
const cls = `${family}-${type}`;

// ── 1. the component ──────────────────────────────────────────────────────────
const component = `// ${Comp} — TODO: one-line "use this when…" so the catalog blurb and this agree.
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ${Props} } from './types';

export function ${Comp}({
  title,
  icon = 'sparkle',
  iconColor = 'var(--insight)',
  summary,
  footer,
  delay,
}: ${Props} & { delay?: number }) {
  const Ic = Icon[icon] || Icon.sparkle;
  return (
    <div
      className="card reveal"
      style={{ ['--delay']: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {/* TODO: render the real content. Design tokens only — no hex. Keep it overflow-safe. */}
      <p className="${cls}-summary">{summary}</p>
      {footer ? <div className="card-foot">{footer}</div> : null}
    </div>
  );
}
`;

// ── 2. the edits (anchored; degrade to a printed snippet if the anchor is absent) ──
const edits = [];
const snippets = [];

// types.ts — props interface + union variant
{
  const src = readFileSync(typesPath, 'utf8');
  const iface = `export interface ${Props} {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  summary: string;
  footer?: HtmlString;
}`;
  const variant = `  | (BlockBase & { type: '${type}'; props: ${Props} })`;
  const unionRe = /export type (\w+Block) =\n([\s\S]*?);\n/;
  const m = src.match(unionRe);
  if (m && !src.includes(Props)) {
    const next = src.replace(unionRe, `${iface}\n\nexport type ${m[1]} =\n${m[2]}\n${variant};\n`);
    edits.push([typesPath, next, `${family}/types.ts — ${Props} + ${m[1]} variant`]);
  } else {
    snippets.push([
      `${family}/types.ts`,
      `${iface}\n\n// …and add to the family's Block union:\n${variant}`,
    ]);
  }
}

// registry.tsx — component import, props import, and the registry entry
{
  const src = readFileSync(registryPath, 'utf8');
  const entry = `  ${type}: (p, c) => <${Comp} {...(p as ${Props})} delay={c.delay} />,`;
  const importLine = `import { ${Comp} } from './${Comp}';`;
  // Anchor the component import right after the always-present registry-types import (a
  // single line), so a multi-line `import type { … } from './types'` can't be split.
  const compAnchorRe = /(from '\.\.\/registry-types';\n)/;
  // The props type-import may be single- OR multi-line; inject Props right after its `{`.
  const typesImportRe = /import type \{([^{}]*)\} from '\.\/types';/;
  const closeRe = /\n\};\s*$/;
  let next = src;
  let auto = true;
  if (!next.includes(importLine)) {
    if (compAnchorRe.test(next)) next = next.replace(compAnchorRe, `$1${importLine}\n`);
    else auto = false;
  }
  const tm = next.match(typesImportRe);
  if (tm && !tm[1].includes(Props)) {
    next = next.replace(typesImportRe, () => `import type {\n  ${Props},${tm[1]}} from './types';`);
  } else if (!tm) {
    auto = false;
  }
  if (auto && closeRe.test(next)) {
    next = next.replace(closeRe, `\n\n${entry}\n};\n`);
    edits.push([registryPath, next, `${family}/registry.tsx — import + entry`]);
  } else {
    snippets.push([
      `${family}/registry.tsx`,
      `${importLine}\n// add '${Props}' to the import from './types', and add this entry inside the registry object:\n${entry}`,
    ]);
  }
}

// catalog.data.ts — createMeta entry before the RAW_CATALOG close
{
  const src = readFileSync(catalogPath, 'utf8');
  const meta = `  createMeta('${type}', {
    family: '${family}',
    dataShapes: ['text'],
    requires: ['title', 'summary'],
    optional: ['icon', 'iconColor', 'footer'],
    wowWeight: 0.6,
    tier: 'frontier',
    colDefault: 6,
    coercer: 'generic',
    blurb: 'TODO: one line on what this block shows and when to use it.',
  }),`;
  const closeRe = /\n\];\s*$/;
  if (!src.includes(`createMeta('${type}'`) && closeRe.test(src)) {
    edits.push([
      catalogPath,
      src.replace(closeRe, `\n${meta}\n];\n`),
      `catalog/catalog.data.ts — createMeta('${type}')`,
    ]);
  } else {
    snippets.push([`catalog/catalog.data.ts (inside RAW_CATALOG)`, meta]);
  }
}

// ── apply (component + css are always safe new content; edits are pre-validated) ──
writeFileSync(compPath, component);
ok(`created ${family}/${Comp}.tsx`);
appendFileSync(stylesPath, `\n/* ${type} */\n.${cls}-summary {\n  color: var(--text);\n}\n`);
ok(`appended a style stub to ${family}/styles.css`);
for (const [path, next, label] of edits) {
  writeFileSync(path, next);
  ok(`wired ${label}`);
}

// ── report ────────────────────────────────────────────────────────────────────
if (snippets.length) {
  console.log(
    `\n\x1b[33mCouldn't auto-wire these (non-standard file shape) — paste manually:\x1b[0m`,
  );
  for (const [where, snip] of snippets) console.log(`\n— ${where} —\n${snip}`);
}
console.log(`\n\x1b[1mNext:\x1b[0m`);
note(`1. Flesh out ${Comp}.tsx, ${Props} (real props), the styles, and the catalog blurb.`);
note(`2. Add a DEMO: a { type: '${type}', col, props: {…} } block in a src/data/topics/* spec.`);
note(`   (canvas-render's coverage test stays red until '${type}' appears in a topic.)`);
note(`3. Verify: pnpm typecheck && pnpm test && pnpm knip   (the protocol test checks the meta).`);
note(`See docs/ADDING-A-COMPONENT.md for the full contract.`);
