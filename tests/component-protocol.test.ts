// component-protocol.test.ts — the pit-of-success guard for adding a UI block.
//
// Adding a block touches a few places (see docs/ADDING-A-COMPONENT.md): a family
// `types.ts`, the `Component.tsx`, the family `registry.tsx`, the family `styles.css`,
// and a `ComponentMeta` in `catalog/catalog.data.ts`. Forget the meta and the block still
// RENDERS in the demo and gallery — but Live can never SELECT it, a silent failure no
// other test catches. These assertions turn each such omission into a red test with a
// message that names exactly what is missing.
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { FAMILIES } from '../src/gallery/families';
/**
 * Block types TopicCanvas resolves with its own `b.type === '…'` branch (not the
 * extended registry). Kept in sync with TopicCanvas.tsx and data-integrity.test.ts.
 */
const CORE_BLOCK_TYPES = [
  'insight',
  'chart',
  'breakdown',
  'timeline',
  'list',
  'compare',
  'ring',
  'bars',
  'stack',
  'scatter',
  'heat',
  'flow',
  'web',
  'gallery',
  'codemap',
  'diff',
  'checks',
  'donut',
  'gauge',
  'scoreboard',
  'standings',
  'pipeline',
  'kpi',
  'quotes',
  'checklist',
  'understand',
  'schema',
  'screenmap',
  'buildprog',
  'preview',
];
/**
 * Types rendered by a DEDICATED TopicCanvas branch — neither a core `b.type ===` case
 * nor an EXTENDED_REGISTRY entry. `composite` is a model-arranged sub-grid of other
 * blocks (TopicCanvas.tsx renders it inline). Renderable, so a meta for it is valid.
 */
const SPECIAL_RENDER = ['composite'];
/**
 * Types intentionally absent from the static catalog because Live exposes them through a
 * SEPARATE, capability-gated path rather than catalog selection. `photo` (a real generated
 * image) is added to the prompt + validator only when the user enables image generation
 * (see liveSchema.PHOTO_BLOCK_TYPE / generateLive), so a static ComponentMeta — which would
 * make Live always consider it — is deliberately omitted. `mindshape` is generated
 * exclusively by the "Watch Me Think" live mode (useMindShape + MindShapeCanvas), never by
 * model selection. Adding to this list is a conscious, reviewed choice, never the default
 * for a new block.
 */
const META_OPTIONAL = [
  'photo',
  'mindshape',
  // The four living-dashboard widgets are rendered by the #/dashboards surface from a dashboard's
  // own data (thesis/tripwires/metrics/sources), never chosen by the model for a normal Live answer
  // — a static ComponentMeta would make Live spontaneously emit a "thesis" or "alignmentgauge" card.
  // Surface-driven, not catalog-selected (same rationale as photo/mindshape). A conscious choice.
  'thesis',
  'alignmentgauge',
  'standingalerts',
  'sourceslineage',
];
const metaTypes = new Set(RAW_CATALOG.map((m: { type: string }) => m.type));
const registryTypes = Object.keys(EXTENDED_REGISTRY);
const renderable = new Set<string>([...CORE_BLOCK_TYPES, ...registryTypes, ...SPECIAL_RENDER]);
describe('component protocol — registry ↔ ComponentMeta bijection', () => {
  it('every registered/core block type has a ComponentMeta (so Live can select it)', () => {
    const optional = new Set(META_OPTIONAL);
    const missing = [...CORE_BLOCK_TYPES, ...registryTypes]
      .filter((t) => !metaTypes.has(t) && !optional.has(t))
      .sort();
    expect(
      missing,
      `These block types render but have no ComponentMeta, so Live will never select them. ` +
        `Add a createMeta(...) entry in catalog/catalog.data.ts (or, if the block is exposed ` +
        `through a gated path like image-gen, add it to META_OPTIONAL with a reason): ${missing.join(', ')}`,
    ).toEqual([]);
  });
  it('every ComponentMeta names a renderable block type (so Live never offers a dead block)', () => {
    const orphan = [...metaTypes].filter((t) => !renderable.has(t)).sort();
    expect(
      orphan,
      `These ComponentMeta entries have no renderer (not a core type, an EXTENDED_REGISTRY key, ` +
        `or a SPECIAL_RENDER branch) — Live could select a block that cannot render: ${orphan.join(', ')}`,
    ).toEqual([]);
  });
});
describe('component protocol — the gallery covers every family', () => {
  it('every canvas/blocks/* family with a registry.tsx has a gallery FAMILIES entry', () => {
    const blocksDir = join(dirname(fileURLToPath(import.meta.url)), '../src/canvas/blocks');
    const onDisk = readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(blocksDir, d.name, 'registry.tsx')))
      .map((d) => d.name)
      .sort();
    const wired = new Set(FAMILIES.map((f) => f.id));
    const missing = onDisk.filter((id) => !wired.has(id));
    expect(
      missing,
      `These block families exist on disk but are not in gallery/families.ts FAMILIES, so their ` +
        `blocks are mis-grouped under "core" in the #/gallery QA surface. Add a labelled entry: ${missing.join(', ')}`,
    ).toEqual([]);
  });
  it('every gallery FAMILIES id maps to a real on-disk family (no stale entries)', () => {
    const blocksDir = join(dirname(fileURLToPath(import.meta.url)), '../src/canvas/blocks');
    const stale = FAMILIES.map((f) => f.id).filter(
      (id) => !existsSync(join(blocksDir, id, 'registry.tsx')),
    );
    expect(
      stale,
      `gallery FAMILIES references families with no registry.tsx: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
/**
 * canvas/lib/motion.css defines the canonical animation vocabulary (see that file's header):
 * every family reaches for one of these four keyframes instead of hand-rolling a near-identical
 * one under its own name. That convention predates this guard, so ~17 family stylesheets already
 * carry their own bespoke @keyframes (c1BarGlow, ms-card-in, lay-fade, …) — retrofitting all of
 * them is a separate, deliberate migration, not something a test should force retroactively. This
 * baseline is that migration's starting line: it is allowed to SHRINK (a family adopting the
 * shared vocabulary should also delete itself from the list) but never GROW, so a brand-new block
 * can't quietly add keyframe #91 to the pile the day after this test was written.
 */
const KNOWN_LEGACY_KEYFRAME_FILES = new Set<string>([
  'ai/styles.css',
  'charts1/styles.css',
  'charts2/styles.css',
  'diagrams/styles.css',
  'display/styles.css',
  'docs/styles.css',
  'flows/styles.css',
  'forms/styles.css',
  'layout/styles.css',
  'learn/styles.css',
  'media/styles.css',
  'nav/styles.css',
  'overlays/styles.css',
  'pickers/styles.css',
  'reference/styles.css',
  'stats/styles.css',
  'status/styles.css',
]);
/** The four names motion.css publishes — see that file's header comment. */
const CANONICAL_KEYFRAMES = new Set([
  'mavea-fade-rise',
  'mavea-scale-in',
  'mavea-draw',
  'mavea-pulse-glow',
]);
/** Every `@keyframes <name>` declared in a stylesheet, whatever the name. */
function keyframeNames(css: string): string[] {
  return [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
}
describe('component protocol — no new hand-rolled @keyframes outside motion.css', () => {
  it('no family styles.css beyond the known-legacy baseline defines its own @keyframes', () => {
    const blocksDir = join(dirname(fileURLToPath(import.meta.url)), '../src/canvas/blocks');
    const families = readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(blocksDir, d.name, 'styles.css')))
      .map((d) => d.name)
      .sort();
    const offenders = families.filter((name) => {
      const css = readFileSync(join(blocksDir, name, 'styles.css'), 'utf8');
      return keyframeNames(css).some((n) => !CANONICAL_KEYFRAMES.has(n));
    });
    const newOffenders = offenders
      .map((name) => `${name}/styles.css`)
      .filter((f) => !KNOWN_LEGACY_KEYFRAME_FILES.has(f));
    expect(
      newOffenders,
      `These family styles.css files define their own @keyframes instead of reusing ` +
        `canvas/lib/motion.css's canonical set (mavea-fade-rise / mavea-scale-in / mavea-draw / ` +
        `mavea-pulse-glow): ${newOffenders.join(', ')}. Reach for the shared vocabulary instead ` +
        `of hand-rolling a near-identical animation.`,
    ).toEqual([]);
  });
  it('a family that drops its bespoke keyframes can leave the legacy allowlist (it never grows)', () => {
    const blocksDir = join(dirname(fileURLToPath(import.meta.url)), '../src/canvas/blocks');
    const stillOffending = [...KNOWN_LEGACY_KEYFRAME_FILES].filter((rel) => {
      const path = join(blocksDir, rel);
      if (!existsSync(path)) return false; // family renamed/removed — not this test's job
      return keyframeNames(readFileSync(path, 'utf8')).some((n) => !CANONICAL_KEYFRAMES.has(n));
    });
    const cleaned = [...KNOWN_LEGACY_KEYFRAME_FILES].filter((f) => !stillOffending.includes(f));
    expect(
      cleaned,
      `these legacy files no longer define bespoke @keyframes — remove them from ` +
        `KNOWN_LEGACY_KEYFRAME_FILES in this test so the baseline keeps shrinking: ${cleaned.join(', ')}`,
    ).toEqual([]);
  });
});
