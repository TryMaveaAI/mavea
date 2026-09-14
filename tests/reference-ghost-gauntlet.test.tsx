// A reference that names nothing must cost the picture an element, never its honesty.
//
// The tolerant seam (`src/engine/itemIdentity.ts`) repairs a reference written as a near-miss or
// as the label a reader can see, and where nothing resolves it leaves the value exactly as
// authored — for the renderer to SKIP. That last clause is a contract the seam cannot enforce: it
// is 33 components each remembering to check a map lookup. Three of them did not, and each drew a
// confident picture of something that was never in the data:
//
//   • phylotree  — an internal node's riser spanned Math.min() of nothing → y1="Infinity".
//   • logicgates — a gate's missing source was read as logic 0, and that invented bit was printed
//                  on the output pin while the card's own truth table highlighted the row saying 1.
//   • gitgraph   — a commit on a branch absent from `branches` clamped to lane 0, so it was drawn
//                  in the first branch's position and colour and the history read as linear.
//
// Remembering is what failed, so nothing here is remembered. The population is derived from what
// the catalog DECLARES (`itemShapes[].refs`, `refProps`) — the same declarations `resolveItemIdentity`
// resolves by — and every declared field is ghosted in turn against the component's own reference
// example. What a skip may cost is an element; what it may never do is put a number on the screen
// that arithmetic on nothing produced, or print the word for an absent value as if it were one.
//
// SCOPE, stated because a gate nobody re-checks is worse than no gate: this file proves the
// NON-FINITE half only — the phylotree failure, where a missing reference is skipped so completely
// that a reduction runs over nothing. It cannot see the other half, where a plausible default is
// substituted and the wrong picture is made of perfectly finite numbers: logicgates' invented 0 and
// gitgraph's lane 0 both pass every assertion here. Widening the population catches neither, and
// widening the ASSERTION would mean deciding what each of 33 pictures should lose, which is the
// per-component judgement the seam exists to avoid.
//
// Two things guard that half instead, and neither is this file. The per-component regressions in
// `canvas-diagrams.test.tsx` and `canvas-code.test.tsx` pin the two known cases, each verified to
// fail on the code before its fix. And `reference-examples-resolve.test.ts` attacks the supply:
// every reference in a shipped example has to point at something, so the model is no longer SHOWN
// a dangling one as house style — which is where 31 of them were, manufactured by the example
// generator's item cap cutting reference graphs in half.
//
// A lexical gate over the substitution IDIOMS was tried and rejected: `?? 0` after a map lookup and
// `Math.max(0, xs.indexOf(…))` appear nine times in `src/canvas/blocks`, and eight are correct — a
// degree count where absence genuinely IS zero, a reduce sentinel, a documented default weight. A
// gate that is ninety percent allowlist and fires on every future honest degree count is a gate
// that gets disabled, so the judgement stays with the reviewer and the regressions.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { ComponentMeta } from '../src/canvas/blocks/catalog/meta';

primeExtendedRegistry(EXTENDED_REGISTRY);

const EXAMPLES = JSON.parse(
  readFileSync('src/live/select/referenceExamples.generated.json', 'utf8'),
) as Record<string, Record<string, unknown>>;

// Deliberately unlike any id, label or word a fixture uses, so nothing can resolve it by the
// seam's own near-miss or by-text routes — this is the reference that genuinely names nothing.
const GHOST = 'zzq-names-nothing-at-all';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** One declared reference field: the array that holds it (empty for a top-level prop) and the field. */
interface RefField {
  prop: string;
  field: string;
}

function declaredRefs(meta: ComponentMeta): RefField[] {
  const out: RefField[] = [];
  for (const spec of meta.itemShapes ?? []) {
    for (const field of spec.refs?.fields ?? []) out.push({ prop: spec.prop, field });
    for (const field of spec.refProps ?? []) out.push({ prop: '', field });
  }
  return out;
}

/** The example with every value of one declared reference field replaced by a name nothing answers. */
function ghosted(example: Record<string, unknown>, ref: RefField): Record<string, unknown> {
  const clone = structuredClone(example);
  const blank = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(() => GHOST) : typeof value === 'string' ? GHOST : value;
  if (ref.prop === '') {
    if (typeof clone[ref.field] === 'string') clone[ref.field] = GHOST;
    return clone;
  }
  const items = clone[ref.prop];
  if (!Array.isArray(items)) return clone;
  for (const item of items) {
    if (isRecord(item) && item[ref.field] !== undefined) item[ref.field] = blank(item[ref.field]);
  }
  return clone;
}

function specFor(block: Block): ConversationSpec {
  return {
    id: 'ghost',
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

// A number that arithmetic on an empty set produced, wherever it can reach the DOM: an attribute
// value, an inline style, or a text node. `Math.min()` of no children is the canonical source.
const NOT_A_NUMBER = /(?:^|[^A-Za-z])(?:NaN|-?Infinity)(?:$|[^A-Za-z])/;

function fabrications(container: HTMLElement): string[] {
  const found: string[] = [];
  for (const el of Array.from(container.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (NOT_A_NUMBER.test(attr.value)) found.push(`<${el.tagName} ${attr.name}="${attr.value}">`);
    }
  }
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (text === 'undefined' || NOT_A_NUMBER.test(text)) found.push(`text "${text}"`);
  }
  return found;
}

const CASES = RAW_CATALOG.flatMap((meta) => {
  const example = EXAMPLES[meta.type];
  if (!isRecord(example)) return [];
  return declaredRefs(meta)
    .filter((ref) => (ref.prop === '' ? ref.field in example : Array.isArray(example[ref.prop])))
    .map((ref) => ({ type: meta.type, ref, example }));
});

describe('a reference naming nothing', () => {
  it('covers the catalog components that declare one', () => {
    expect(new Set(CASES.map((c) => c.type)).size).toBeGreaterThan(20);
    expect(CASES.length).toBeGreaterThan(30);
  });

  it.each(
    CASES.map((c) => [`${c.type} ${c.ref.prop || '(top level)'}.${c.ref.field}`, c] as const),
  )('costs %s an element, never its honesty', (_name, testCase) => {
    const props = ghosted(testCase.example, testCase.ref);
    const { container, unmount } = render(
      <TopicCanvas
        data={specFor({ id: 'b1', col: 12, type: testCase.type, props } as Block)}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    expect(fabrications(container)).toEqual([]);
    unmount();
  });

  it('still renders each example untouched, so the ghost is what the case proves', () => {
    for (const type of new Set(CASES.map((c) => c.type))) {
      const example = EXAMPLES[type];
      const { container, unmount } = render(
        <TopicCanvas
          data={specFor({ id: 'b1', col: 12, type, props: example } as Block)}
          spot={null}
          built={{}}
          onProve={() => {}}
        />,
      );
      expect(fabrications(container), type).toEqual([]);
      unmount();
    }
  });
});
