// live-coercion-gauntlet.test.tsx — validated ⇒ visible, for the WHOLE catalog.
//
// The invariant this enforces: any block that SURVIVES validateLiveResponse must render
// something visible on the canvas — its designed component, or its FallbackCard. The lane
// it closes: coerceGeneric only checks that required props are non-empty, not that their
// SHAPE matches what the component dereferences, so a model's wrong-shaped-but-non-empty
// props used to pass validation, throw at render, and vanish (taking the answer's content
// and orphaning its section header). Every generic-coerced type is fed the three hostile
// shapes models actually produce; whatever validation lets through must show up on screen.
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { validateLiveResponse } from '../src/engine/liveSchema';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
primeExtendedRegistry(EXTENDED_REGISTRY);
function specFor(blocks: Block[]): ConversationSpec {
  return {
    id: 'money',
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [{ name: 'Source', color: 'var(--presence)' }],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}
/** Keys that read as a heading — hostile fixtures still give these a plain string, since
 *  the interesting failures live in the structured props, not the title. */
const TITLE_LIKE = /title|label|name|heading|question|eyebrow|caption|period|file|center/i;
/** The three wrong-shape lanes a model actually produces for a structured prop. */
const HOSTILE_LANES: { name: string; value: (key: string) => unknown }[] = [
  {
    // Objectified items: `steps: [{text: …}]` where the renderer wants plain strings,
    // or item objects whose field names the component never reads.
    name: 'objectified-items',
    value: () => [
      { text: 'Alpha line of real content' },
      { text: 'Beta line of real content' },
      { text: 'Gamma line of real content' },
    ],
  },
  {
    // A bare string where an array/object was expected — non-empty, so the old
    // requires-check waved it through.
    name: 'string-for-structure',
    value: () => 'one plain string of content',
  },
  {
    // Plain strings where the renderer expects item objects.
    name: 'string-array',
    value: () => ['first plain item', 'second plain item', 'third plain item'],
  },
];
const GENERIC_TYPES = RAW_CATALOG.filter((m) => m.coercer === 'generic');
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});
describe('coercion gauntlet — every generic type × hostile prop shapes', () => {
  const cases = GENERIC_TYPES.flatMap((m) =>
    HOSTILE_LANES.map((lane) => [`${m.type} [${lane.name}]`, m, lane] as const),
  );
  it.each(cases)('validated ⇒ visible: %s', (_label, meta, lane) => {
    const props: Record<string, unknown> = {};
    for (const key of meta.requires) {
      props[key] = TITLE_LIKE.test(key) ? 'Sample heading' : lane.value(key);
    }
    const r = validateLiveResponse(
      { title: 'T', narration: 'N.', blocks: [{ type: meta.type, props }] },
      new Set([meta.type]),
      6,
      true, // grounded — the honesty gates are not what this test exercises
    );
    // Dropped at validation is a legitimate outcome — the invariant covers survivors.
    if (!r || r.blocks.length === 0) return;
    const { container, unmount } = render(
      <TopicCanvas data={specFor(r.blocks)} spot={null} built={{}} onProve={() => {}} />,
    );
    // The survivor must be VISIBLE: its designed card, or its FallbackCard — never nothing.
    const visible = container.querySelector('.card, .card-grid, .fb-card');
    expect(visible, `${meta.type} survived validation but rendered nothing`).not.toBeNull();
    unmount();
  });
});
