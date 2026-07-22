import { TOPIC_LIST, TOPICS } from '../src/data/topics';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { Icon } from '../src/icons/icons';

// per-family registries — imported individually to prove the merge has no key collisions
import { charts1Registry } from '../src/canvas/blocks/charts1/registry';
import { charts2Registry } from '../src/canvas/blocks/charts2/registry';
import { statsRegistry } from '../src/canvas/blocks/stats/registry';
import { tablesRegistry } from '../src/canvas/blocks/tables/registry';
import { flowsRegistry } from '../src/canvas/blocks/flows/registry';
import { docsRegistry } from '../src/canvas/blocks/docs/registry';
import { aiRegistry } from '../src/canvas/blocks/ai/registry';
import { mediaRegistry } from '../src/canvas/blocks/media/registry';
import { layoutRegistry } from '../src/canvas/blocks/layout/registry';
import { statusRegistry } from '../src/canvas/blocks/status/registry';
import { overlaysRegistry } from '../src/canvas/blocks/overlays/registry';
import { formsRegistry } from '../src/canvas/blocks/forms/registry';
import { pickersRegistry } from '../src/canvas/blocks/pickers/registry';
import { navRegistry } from '../src/canvas/blocks/nav/registry';
import { displayRegistry } from '../src/canvas/blocks/display/registry';
import { diagramsRegistry } from '../src/canvas/blocks/diagrams/registry';
import { learnRegistry } from '../src/canvas/blocks/learn/registry';
import { composeRegistry } from '../src/canvas/blocks/compose/registry';
import { everydayRegistry } from '../src/canvas/blocks/everyday/registry';
import { referenceRegistry } from '../src/canvas/blocks/reference/registry';
import { codeRegistry } from '../src/canvas/blocks/code/registry';
import { dashboardRegistry } from '../src/canvas/blocks/dashboard/registry';
import { financeRegistry } from '../src/canvas/blocks/finance/registry';

// These tests are the highest-confidence guardrail in the suite: they pin the data
// contract that the whole canvas renders from. A fixture spec or a registry key that
// drifts out of the contract is caught here long before it reaches the screen as a
// blank card or a wrong color. (data/topics is the shared block-fixture corpus feeding
// the gallery, Live's prop-shape examples, and the render gauntlets — not demo content.)

/**
 * The block types TopicCanvas resolves with its own `b.type === '...'` branches. Every
 * other type falls through to EXTENDED_REGISTRY. Kept in sync with TopicCanvas.tsx — a
 * core type renaming that misses one place will surface as an unrenderable block, which
 * the per-spec validity test below turns into a failure.
 */
const CORE_BLOCK_TYPES = new Set([
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
]);

/** A block type renders iff TopicCanvas has a branch for it OR the registry has a key. */
const isRenderableType = (type: string): boolean =>
  CORE_BLOCK_TYPES.has(type) || type in EXTENDED_REGISTRY;

/** The full IconKey vocabulary — the only icon names data is allowed to reference. */
const ICON_KEYS = new Set(Object.keys(Icon));

/** The AccentVar token set from data/conversation.ts — the only CSS-var colors data may use. */
const ACCENT_VARS = new Set([
  'var(--presence)',
  'var(--presence-soft)',
  'var(--presence-deep)',
  'var(--insight)',
  'var(--insight-soft)',
  'var(--warning)',
  'var(--warning-soft)',
  'var(--danger)',
  'var(--text-muted)',
]);

describe('topic registry — structure & wiring', () => {
  it('exposes a non-empty, deterministically ordered TOPIC_LIST', () => {
    expect(TOPIC_LIST.length).toBeGreaterThan(0);
    // TOPICS is built from TOPIC_LIST; equal sizes prove no id silently collided on build.
    expect(Object.keys(TOPICS)).toHaveLength(TOPIC_LIST.length);
  });

  it('keys TOPICS by spec id, with unique ids across the list', () => {
    const ids = TOPIC_LIST.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const spec of TOPIC_LIST) {
      expect(TOPICS[spec.id]).toBe(spec);
    }
  });
});

describe('every topic spec is valid', () => {
  it.each(TOPIC_LIST.map((spec) => [spec.id, spec] as const))(
    '%s — has a title and at least one block',
    (_id, spec) => {
      expect(spec.id).toBeTruthy();
      expect(typeof spec.title).toBe('string');
      expect(spec.title.length).toBeGreaterThan(0);
      expect(Array.isArray(spec.blocks)).toBe(true);
      expect(spec.blocks.length).toBeGreaterThan(0);
    },
  );

  it.each(TOPIC_LIST.map((spec) => [spec.id, spec] as const))(
    '%s — every block has a renderable type and a 1..12 col',
    (id, spec) => {
      for (const block of spec.blocks) {
        const b = block as { type: string; col: number };
        expect(isRenderableType(b.type), `${id}: type "${b.type}" has no renderer`).toBe(true);
        expect(Number.isInteger(b.col), `${id}:${b.type} col is not an integer`).toBe(true);
        expect(b.col, `${id}:${b.type} col=${b.col} out of 1..12`).toBeGreaterThanOrEqual(1);
        expect(b.col).toBeLessThanOrEqual(12);
      }
    },
  );

  it.each(TOPIC_LIST.map((spec) => [spec.id, spec] as const))(
    '%s — block ids are unique within the spec',
    (id, spec) => {
      const seen = new Set<string>();
      for (const block of spec.blocks) {
        const bid = (block as { id?: string }).id;
        if (!bid) continue;
        expect(seen.has(bid), `${id}: duplicate block id "${bid}"`).toBe(false);
        seen.add(bid);
      }
    },
  );

  it('every insight block carries the id+num the union requires (spotlight anchor)', () => {
    for (const spec of TOPIC_LIST) {
      for (const block of spec.blocks) {
        if (block.type !== 'insight') continue;
        expect(block.id, `${spec.id}: insight missing id`).toBeTruthy();
        expect(block.num, `${spec.id}: insight missing num`).toBeTruthy();
      }
    }
  });
});

describe('colors & icons stay inside the allowed tokens', () => {
  // Deep-walk every spec, validating each `icon` against the icon set and each CSS-var
  // color string against the AccentVar set. Raw hex colors (allowed on a few props like
  // StackSeg.color) are intentionally skipped — only `var(--…)` strings are token-checked.
  const collectViolations = () => {
    const iconBad: string[] = [];
    const colorBad: string[] = [];
    const walk = (value: unknown, where: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${where}[${i}]`));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
          if (key === 'icon' && typeof val === 'string' && !ICON_KEYS.has(val)) {
            iconBad.push(`${where}.icon="${val}"`);
          }
          if (typeof val === 'string' && val.startsWith('var(--') && !ACCENT_VARS.has(val)) {
            colorBad.push(`${where}.${key}="${val}"`);
          }
          walk(val, `${where}.${key}`);
        }
      }
    };
    for (const spec of TOPIC_LIST) walk(spec, spec.id);
    return { iconBad, colorBad };
  };

  it('uses only known IconKey values', () => {
    expect(collectViolations().iconBad).toEqual([]);
  });

  it('uses only allowed AccentVar CSS-variable colors', () => {
    expect(collectViolations().colorBad).toEqual([]);
  });

  it('every suggest chip names a real icon', () => {
    for (const spec of TOPIC_LIST) {
      for (const s of spec.suggests) {
        expect(ICON_KEYS.has(s.icon), `${spec.id}: suggest icon "${s.icon}"`).toBe(true);
      }
    }
  });
});

describe('extended registry integrity', () => {
  const FAMILY_REGISTRIES = [
    charts1Registry,
    charts2Registry,
    statsRegistry,
    tablesRegistry,
    flowsRegistry,
    docsRegistry,
    aiRegistry,
    mediaRegistry,
    layoutRegistry,
    statusRegistry,
    overlaysRegistry,
    formsRegistry,
    pickersRegistry,
    navRegistry,
    displayRegistry,
    diagramsRegistry,
    learnRegistry,
    composeRegistry,
    everydayRegistry,
    referenceRegistry,
    codeRegistry,
    dashboardRegistry,
    financeRegistry,
  ];

  it('every entry is a defined render function', () => {
    const keys = Object.keys(EXTENDED_REGISTRY);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof EXTENDED_REGISTRY[key], `registry["${key}"] is not a function`).toBe(
        'function',
      );
    }
  });

  it('merges all families with no overwritten (duplicate) keys', () => {
    const summed = FAMILY_REGISTRIES.reduce((n, fam) => n + Object.keys(fam).length, 0);
    // If two families shared a key, the spread merge would drop one and merged < summed.
    expect(Object.keys(EXTENDED_REGISTRY).length).toBe(summed);
  });

  it('no core block type is shadowed by a registry key (the switch always wins, but they must not collide)', () => {
    for (const type of CORE_BLOCK_TYPES) {
      expect(type in EXTENDED_REGISTRY, `core type "${type}" is also a registry key`).toBe(false);
    }
  });
});
