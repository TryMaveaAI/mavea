// Derives REQUIRED-ONLY, TYPICAL, and EXTREME fixtures for every registered
// block type from the authored topic demos and the component catalog.
//
// Three modes per type:
//   required-only — only the props listed in ComponentMeta.requires (tests
//                   graceful degradation when optional data is absent)
//   typical       — the first authored demo block, as shipped
//   extreme       — demo block with item arrays × 10 (capped at 50) and
//                   strings doubled (tests overflow handling + density rollup)
//
// The gauntlet renders all three through TopicCanvas to catch crashes, blank
// sections from missing-optional branches, and layout overflows.

import { TOPIC_LIST } from '../../src/data/topics';
import { RAW_CATALOG } from '../../src/canvas/blocks/catalog/catalog.data';
import type { Block } from '../../src/data/conversation';

export type FixtureMode = 'required-only' | 'typical' | 'extreme';

export interface BlockFixture {
  type: string;
  mode: FixtureMode;
  block: Block;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const MAX_EXTREME_ITEMS = 50;
// Tree structures (parsetree, mindshape) store nodes in nested `children` arrays.
// Expanding children by 10× grows O(branchFactor^depth) — a 3-item array at depth 3
// would become 30^3 = 27 000 nodes. Cap tree-child arrays at 4 to stay O(4^3 = 64).
const MAX_EXTREME_TREE_CHILDREN = 4;
const TREE_CHILD_KEYS = new Set(['children', 'nodes']);

// Grid-of-grid shapes (scatterplotmatrix: an n×n grid of cells, each rendering its own
// O(rows) circle list) compound TWO independently-capped arrays multiplicatively — 50 vars
// × 50 rows is 2 500 cells each drawing up to 50 circles, ~125 000 SVG nodes in one mount.
// `vars`/`rows` are each already capped at MAX_EXTREME_ITEMS individually; this caps their
// PRODUCT afterward so the gauntlet still exercises overflow behavior without the
// combinatorial blowup. Keyed by prop shape, not by block type, so it applies to any future
// block with the same n²-grid-of-row-lists shape.
const MAX_EXTREME_GRID_TIMES_ROWS = 500;

function capGridTimesRows(block: Block): Block {
  const src = block as unknown as Record<string, unknown>;
  const props = src.props as Record<string, unknown> | undefined;
  if (!props) return block;
  const vars = props.vars;
  const rows = props.rows;
  if (!Array.isArray(vars) || !Array.isArray(rows) || vars.length <= 1) return block;
  const maxRows = Math.max(
    1,
    Math.floor(MAX_EXTREME_GRID_TIMES_ROWS / (vars.length * vars.length)),
  );
  if (rows.length <= maxRows) return block;
  return { ...src, props: { ...props, rows: rows.slice(0, maxRows) } } as unknown as Block;
}

/** Long but human-grade text for stress-testing overflow handling. */
const LONG_SUFFIX = ' — The quick brown fox jumps over the lazy dog near the riverbank at sunset';

// Keys whose string values are references, enums, or identifiers — must NOT be
// lengthened or the component's id-based lookups (from→state, etc.) will break.
const SKIP_STRING_KEYS = new Set([
  // identity / references
  'id',
  'type',
  'from',
  'to',
  'key',
  'src',
  'href',
  'url',
  // enum / lookup keys — used as Record<K, …> indices; must stay valid enum values
  'color',
  'icon',
  'variant',
  'stance',
  'kind',
  'format',
  'unit',
  'ticker',
  'lang',
  'locale',
  'tone',
  'status',
  'level',
  'phase',
  'state',
  'severity',
  'priority',
  'tier',
  'category',
  'align',
  'dir',
  'position',
  'size',
]);

function isDisplayText(s: string): boolean {
  // Display text typically contains spaces or is long sentence-like text.
  // Single-word strings (camelCase, lowercase, UPPER) are likely enum values,
  // CSS variables, icon names, or identifiers — leave them untouched.
  return s.includes(' ') || s.length > 30;
}

function lengthenString(s: string): string {
  if (s.length >= 100) return s;
  return s + LONG_SUFFIX.slice(0, Math.max(0, 100 - s.length));
}

function stressValue(val: unknown, key?: string): unknown {
  if (typeof val === 'string') {
    // Skip known reference/enum keys by name, AND skip single-word values that
    // are likely enum values regardless of which key they're stored under.
    if (key && SKIP_STRING_KEYS.has(key)) return val;
    if (!isDisplayText(val)) return val;
    return lengthenString(val);
  }
  if (Array.isArray(val)) {
    const base = val.map((item) => stressValue(item));
    // Tree-child arrays grow exponentially with depth — cap them tightly so the
    // gauntlet render stays O(polynomial) instead of O(exponential).
    const cap = key && TREE_CHILD_KEYS.has(key) ? MAX_EXTREME_TREE_CHILDREN : MAX_EXTREME_ITEMS;
    const target = Math.min(cap, val.length * 10);
    const out: unknown[] = [];
    while (out.length < target) {
      for (const item of base) {
        if (out.length >= target) break;
        out.push(item);
      }
    }
    return out;
  }
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, stressValue(v, k)]),
    );
  }
  return val;
}

function toExtreme(block: Block): Block {
  return capGridTimesRows(stressValue(block) as Block);
}

function toRequiredOnly(block: Block, requiredKeys: string[]): Block {
  const src = block as unknown as Record<string, unknown>;
  const propsObj = src.props as Record<string, unknown> | undefined;

  // Blocks use a `props` object that carries all the component-facing props.
  // Strip optional prop keys from that nested object; leave the outer BlockBase
  // fields (type, col, id, delay) untouched — they are not component props.
  if (!propsObj) return block;

  const keep = new Set(requiredKeys);
  const filteredProps: Record<string, unknown> = {};
  for (const key of keep) {
    if (key in propsObj) filteredProps[key] = propsObj[key];
  }
  return { ...src, props: filteredProps } as unknown as Block;
}

// ── build ────────────────────────────────────────────────────────────────────

const catalogByType: ReadonlyMap<string, { requires: string[]; optional: string[] }> = new Map(
  RAW_CATALOG.map((m) => [m.type, { requires: m.requires, optional: m.optional }]),
);

/** Returns all three fixture modes for every authored block type. */
export function buildFixtures(): BlockFixture[] {
  // Index the first authored block per type across all topic specs.
  const firstByType = new Map<string, Block>();
  for (const topic of TOPIC_LIST) {
    for (const block of topic.blocks) {
      if (!firstByType.has(block.type)) {
        firstByType.set(block.type, block);
      }
    }
  }

  const fixtures: BlockFixture[] = [];

  for (const [type, block] of firstByType) {
    const meta = catalogByType.get(type);

    // typical — the authored block as-is
    fixtures.push({ type, mode: 'typical', block });

    // required-only — strip optional props; only when there are optional props to strip
    if (meta && meta.optional.length > 0) {
      fixtures.push({ type, mode: 'required-only', block: toRequiredOnly(block, meta.requires) });
    }

    // extreme — stress-test overflow / density handling
    fixtures.push({ type, mode: 'extreme', block: toExtreme(block) });
  }

  return fixtures;
}

/** All fixtures, pre-built once. Import this in tests to avoid repeated construction. */
export const ALL_FIXTURES: BlockFixture[] = buildFixtures();
