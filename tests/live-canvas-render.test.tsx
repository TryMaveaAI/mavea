// live-canvas-render.test.tsx — the failure-proof guarantee, exercised for real.
//
// Live coerces blocks across the whole component library from a real model's loose JSON.
// This renders ONE block of every coercible type through the actual TopicCanvas (and its
// per-block BlockBoundary) and asserts the surface never throws — a component that meets
// an unexpected prop shape drops to an empty cell, it does not blank the canvas. It also
// reports how many types render real content, which flags the ones still wanting a custom
// builder.
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { COERCIBLE_TYPES } from '../src/live/select';
import type { ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);
// A key that almost certainly holds a list in this library's prop vocabulary.
const ARRAY_KEYS = new Set([
  'rows',
  'items',
  'data',
  'points',
  'events',
  'series',
  'segments',
  'bars',
  'stages',
  'steps',
  'cols',
  'columns',
  'labels',
  'options',
  'criteria',
  'rings',
  'kpis',
  'nodes',
  'pins',
  'quotes',
  'results',
  'games',
  'entities',
  'paragraphs',
  'claims',
  'sources',
  'panels',
  'lanes',
  'slides',
  'callouts',
  'milestones',
  'tabs',
  'cards',
  'tasks',
  'highlights',
  'relations',
  'edges',
  'links',
  'cells',
  'metrics',
  'objectives',
  'tokens',
  'calls',
  'chunks',
  'bins',
  'regions',
  'markers',
  'candles',
  'records',
  'tiles',
  'parts',
  'evidenceFor',
  'evidenceAgainst',
]);
const NUMERIC_KEYS =
  /^(value|val|count|total|score|pct|percent|max|min|num|size|thickness|goal|x|y|lat|lng|progress)$/i;
/** A rich "kitchen-sink" object so a component finds whichever sub-keys it expects. */
function sampleObject(i: number): Record<string, unknown> {
  return {
    label: `Item ${i}`,
    name: `Item ${i}`,
    title: `Item ${i}`,
    text: `Item ${i}`,
    detail: 'detail',
    sub: 'sub',
    value: 40 + i,
    val: `${40 + i}`,
    pct: 30 + i,
    display: `${30 + i}%`,
    delta: '+5%',
    color: 'var(--presence)',
    time: 'Mon',
    date: '2025-01-01',
    status: 'done',
    done: true,
    x: i,
    y: i * 2,
  };
}
function sampleValue(key: string): unknown {
  if (ARRAY_KEYS.has(key) || (key.endsWith('s') && !NUMERIC_KEYS.test(key))) {
    return [sampleObject(1), sampleObject(2), sampleObject(3)];
  }
  if (NUMERIC_KEYS.test(key)) return 50;
  return 'Sample';
}
function specOfAllCoercible(): { spec: ConversationSpec; produced: string[] } {
  const types = [...COERCIBLE_TYPES];
  const blocks = types.map((type) => {
    const meta = RAW_CATALOG.find((m) => m.type === type);
    const props: Record<string, unknown> = {};
    for (const k of [...(meta?.requires ?? []), ...(meta?.optional ?? [])])
      props[k] = sampleValue(k);
    return { type, props };
  });
  const validated = validateLiveResponse(
    { title: 'All', sub: '', narration: '', blocks },
    COERCIBLE_TYPES,
    9999,
  );
  const spec: ConversationSpec = {
    id: 'live',
    workspace: 'Live',
    title: 'All',
    sub: '',
    opener: '',
    context: [],
    blocks: validated?.blocks ?? [],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
  return { spec, produced: (validated?.blocks ?? []).map((b) => b.type) };
}
describe('Live canvas — failure-proof rendering of the full vocabulary', () => {
  it('coerces and renders every coercible type without ever crashing the surface', () => {
    const { spec, produced } = specOfAllCoercible();
    // The coercers keep the vast majority of types (those they can fill from the sample).
    expect(produced.length).toBeGreaterThan(100);
    let container: HTMLElement | null = null;
    expect(() => {
      container = render(
        <TopicCanvas data={spec} spot={null} built={{}} onProve={() => {}} />,
      ).container;
    }).not.toThrow();
    // The grid is up and most cells rendered real content rather than an empty boundary.
    const grid = container!.querySelector('.card-grid');
    expect(grid).not.toBeNull();
    const nonEmptyCells = [...grid!.children].filter((c) => c.children.length > 0).length;
    console.log(
      `live-canvas-render: ${nonEmptyCells}/${spec.blocks.length} component types rendered content`,
    );
    expect(nonEmptyCells).toBeGreaterThan(spec.blocks.length * 0.6);
  }, 60_000); // renders the full block vocabulary; the global 20s budget flakes under heavy load
});
