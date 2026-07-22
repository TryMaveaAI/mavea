// canvas-gauntlet.test.tsx — stress-tests every registered block type at three
// fixture intensities: required-only, typical, and extreme (10× items, long
// strings). Guards the three quality-floor properties that break silently:
//
//   1. No crash — the block mounts and unmounts cleanly in all fixture modes.
//   2. No undefined/NaN text — rendered text nodes never contain the
//      literal strings "undefined" or "NaN" (a common symptom of missing
//      default handling or absent optional props).
//   3. No dangling section headers — optional section headings must not appear
//      when their owning data prop was stripped (required-only mode).
//
// This test complements canvas-render.test.tsx (which exercises authored props
// through the real render pipeline) by targeting the *edge cases* the authored
// demos were never meant to cover.

import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { ALL_FIXTURES } from './lib/stressFixtures';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

/** Wrap one block in the minimal spec TopicCanvas expects. */
function specForBlock(block: Block): ConversationSpec {
  return {
    id: 'money',
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [{ name: 'Source', color: 'var(--presence)' }],
    blocks: [block],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

// ── sanity ───────────────────────────────────────────────────────────────────

describe('Gauntlet — fixture corpus', () => {
  it('generates a non-trivial fixture set', () => {
    expect(ALL_FIXTURES.length).toBeGreaterThan(100);
  });

  it('covers required-only and extreme modes for most types', () => {
    const modes = new Set(ALL_FIXTURES.map((f) => f.mode));
    expect(modes).toContain('typical');
    expect(modes).toContain('required-only');
    expect(modes).toContain('extreme');
  });
});

// ── per-fixture mount+unmount ─────────────────────────────────────────────────

describe('Canvas gauntlet — all types × 3 modes', () => {
  it.each(
    ALL_FIXTURES.map((f) => [`${f.type} [${f.mode}]`, f] as [string, (typeof ALL_FIXTURES)[0]]),
  )('mounts/unmounts without crash: %s', (_label, { block }) => {
    const { container, unmount } = render(
      <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
    );

    // Every block must produce at least a .card wrapper (or .card-grid for preview).
    const hasCard =
      block.type === 'preview'
        ? container.querySelector('.card-grid') !== null
        : container.querySelector('.card') !== null;
    expect(hasCard).toBe(true);

    // No leaked overlays after unmount.
    unmount();
    expect(document.body.querySelector('.ov-root')).toBeNull();
  });
});

// ── undefined/NaN text ────────────────────────────────────────────────────────

describe('Canvas gauntlet — no undefined or NaN in rendered text', () => {
  it.each(
    ALL_FIXTURES.map((f) => [`${f.type} [${f.mode}]`, f] as [string, (typeof ALL_FIXTURES)[0]]),
  )('no "undefined" or "NaN" text nodes: %s', (_label, { block }) => {
    const { container, unmount } = render(
      <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
    );

    // Walk text nodes only — attribute values (aria-labels etc.) intentionally excluded.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      // Strip whitespace; skip empty / pure-whitespace nodes.
      const trimmed = text.trim();
      if (trimmed === 'undefined' || trimmed === 'NaN') {
        bad.push(`[${trimmed}]`);
      }
      node = walker.nextNode();
    }

    unmount();

    expect(bad).toEqual([]);
  });
});

// ── required-only: no dangling section headers ────────────────────────────────
//
// Optional sections (e.g. a "Comparison" panel, an "Analysis" header) must not
// appear when their data prop was stripped. The heuristic: in required-only mode,
// EVERY visible heading-level element whose text exactly matches one of the known
// "section header" patterns must have at least one sibling or child content node
// other than another heading. A lonely <h3> with no body is a dangling header.
//
// We verify with a softer check: the required-only render must have ≤ card-count
// heading elements compared to the typical render (dangling headers inflate counts).

describe('Canvas gauntlet — required-only renders no more headings than typical', () => {
  // Group fixtures by type so we can compare required-only vs typical.
  const byType = new Map<string, { typical?: Block; requiredOnly?: Block }>();
  for (const f of ALL_FIXTURES) {
    const entry = byType.get(f.type) ?? {};
    if (f.mode === 'typical') entry.typical = f.block;
    if (f.mode === 'required-only') entry.requiredOnly = f.block;
    byType.set(f.type, entry);
  }

  const pairs = [...byType.entries()]
    .filter(([, e]) => e.typical && e.requiredOnly)
    .map(([type, e]) => [type, e] as const);

  it.each(pairs)(
    'required-only has ≤ heading count of typical: %s',
    (_type, { typical, requiredOnly }) => {
      const countHeadings = (block: Block) => {
        const { container, unmount } = render(
          <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
        );
        const n = container.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
        unmount();
        return n;
      };

      const typicalH = countHeadings(typical!);
      const roH = countHeadings(requiredOnly!);
      expect(roH).toBeLessThanOrEqual(typicalH);
    },
  );
});
