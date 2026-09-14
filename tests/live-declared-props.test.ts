// live-declared-props.test.ts — which props a generic block is allowed to keep.
//
// Two independently maintained lists decide that, and nothing used to hold them together:
// `requires`/`optional`, hand-written in catalog/families/*.ts, and the structural reference that
// `pnpm gen:catalog` derives from the component's real shipping fixture. The prompt menu prints the
// FIXTURE as the `example:` line, so a model that copies the example emits the reference's keys —
// and any of those missing from the hand-kept list were projected, validated, and then deleted.
// polarplot was the report: its example is `{title, icon, iconColor, fn, domain}` and the renderer
// received `{title, domain}`, an empty dial with a caption.
import { describe, it, expect } from 'vitest';
import { CATALOG_FACTS } from '../src/canvas/blocks/catalog/facts';
import { catalogMeta } from '../src/canvas/blocks/catalog/lookup';
import { STRUCTURAL_REFERENCES } from '../src/canvas/blocks/catalog/structures.generated';
import { referencePropsFor } from '../src/live/select/examples';
import { validateLiveResponse } from '../src/engine/liveSchema';

/** The generic coercer is the only path that projects onto a structural reference; the hand-written
 *  builders own their own shapes. */
const GENERIC = CATALOG_FACTS.filter((f) => f.coercer === 'generic').map((f) => f.type);
const ALLOWED = new Set(GENERIC);

/** One block through the real validator, as a standalone tile so composition floors don't apply. */
function validateProps(type: string, props: Record<string, unknown>) {
  const res = validateLiveResponse(
    { title: 'T', sub: '', narration: '', blocks: [{ type, props }] },
    ALLOWED,
    1,
    false,
    true,
  );
  return res?.blocks[0]?.props as Record<string, unknown> | undefined;
}

/** Where the validated output holds fewer items than the example it was projected from, as
 *  `.path[]: 5 -> 4` lines. Walks arrays and objects together, so a shortfall is reported at the
 *  exact field rather than as a missing key. */
function itemsLost(example: unknown, out: unknown, path: string): string[] {
  if (Array.isArray(example)) {
    if (!Array.isArray(out)) return [`${path}: dropped`];
    const lost = out.length < example.length ? [`${path}: ${example.length} -> ${out.length}`] : [];
    return [
      ...lost,
      ...example.flatMap((item, index) =>
        index < out.length ? itemsLost(item, out[index], `${path}[${index}]`) : [],
      ),
    ];
  }
  if (!example || typeof example !== 'object' || !out || typeof out !== 'object') return [];
  return Object.entries(example as Record<string, unknown>).flatMap(([key, value]) =>
    key in (out as Record<string, unknown>)
      ? itemsLost(value, (out as Record<string, unknown>)[key], `${path}.${key}`)
      : [],
  );
}

describe('generic coercion — the props a block is allowed to keep', () => {
  it('keeps the polarplot curve the prompt’s own example teaches', () => {
    const out = validateProps('polarplot', {
      title: 'Rose curve  r = cos(2θ)',
      icon: 'chart',
      iconColor: 'var(--presence)',
      fn: 'cos(2*t)',
      domain: [0, 6.2832],
    });
    // Without `fn` the component draws the dial and no curve at all.
    expect(out?.fn).toBe('cos(2*t)');
    expect(out?.icon).toBe('chart');
    expect(out?.domain).toEqual([0, 6.2832]);
  });

  it('accepts every component’s own shipping example whole', () => {
    // tests/setup preloads every example shard; without them this sweep would pass vacuously.
    expect(referencePropsFor('polarplot')).not.toBeNull();
    const lost: string[] = [];
    for (const type of GENERIC) {
      const example = referencePropsFor(type);
      if (!example) continue;
      const out = validateProps(type, example);
      if (!out) {
        lost.push(`${type}: the whole block`);
        continue;
      }
      const missing = Object.keys(example).filter((key) => out[key] === undefined);
      if (missing.length) lost.push(`${type}: ${missing.join(', ')}`);
      // …and whole means every ITEM too, not just the top-level keys. A key can survive a element
      // short: `graphtrace`'s first step has visited nothing, the empty `visited: []` read as a
      // broken field rather than a truthful one, and the step it belonged to was dropped — so the
      // BFS walk the card exists to show opened on its second frame. Counting keys could not see it.
      for (const shortfall of itemsLost(example, out, '')) lost.push(`${type}${shortfall}`);
    }
    // A component's example is the one prop shape the model is shown verbatim. Losing a key of it
    // means the menu teaches something the validator then throws away.
    expect(lost).toEqual([]);
  });

  it('gives every required prop a contract to be checked against', () => {
    const uncheckable: string[] = [];
    for (const type of GENERIC) {
      const reference = STRUCTURAL_REFERENCES[type] as Record<string, unknown> | undefined;
      const meta = catalogMeta(type);
      if (!reference || !meta) {
        uncheckable.push(`${type}: no reference`);
        continue;
      }
      const missing = meta.requires.filter((key) => !(key in reference));
      if (missing.length) uncheckable.push(`${type}: ${missing.join(', ')}`);
    }
    // A required prop the reference has no entry for cannot be validated, so the coercer drops the
    // whole block — the component becomes unofferable the moment a family declares one.
    expect(uncheckable).toEqual([]);
  });
});
