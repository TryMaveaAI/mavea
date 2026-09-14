import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { enumValuesFromHint } from '../src/canvas/blocks/catalog/propHints';
import { validateLiveResponse } from '../src/engine/liveSchema';
import type { ComponentMeta } from '../src/canvas/blocks/catalog/meta';

// The guard for cross-array references.
//
// Plenty of blocks carry two item arrays where one NAMES the other by id — an edge's endpoints, a
// message's lifelines, a seat's table, a child list. A model writes the label it can SEE about as
// often as the id, so the validator resolves a reference leniently: the exact id, then
// case/whitespace drift, then an unambiguous label. Where nothing resolves it, the renderer looks
// the name up, gets `undefined`, falls back to a default, and draws a confident picture of the
// wrong thing. `sequencediagram` shipped exactly that way — its messages named actors, nothing
// declared the reference, and every arrow collapsed onto the card's left edge at x=0 with its
// label half outside the frame.
//
// Remembering to declare it is what failed, so nothing here is remembered. The reference example
// is the oracle: it already shows which arrays are keyed by id and which fields hold those keys,
// and the requirement is derived from it. Both halves are then checked — that a generically
// coerced component DECLARES the reference, which is the only way it gets resolved, and that the
// reference actually survives the validator when a model writes the label instead of the id.
const EXAMPLES = JSON.parse(
  readFileSync('src/live/select/referenceExamples.generated.json', 'utf8'),
) as Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** One field that names another array's ids — the unit both halves of this test are written in. */
interface Reference {
  /** The array holding the referencing field; empty for a top-level prop (a tree's `root`). */
  prop: string;
  field: string;
  to: string;
}

function refKey({ prop, field, to }: Reference): string {
  return `${prop}.${field} -> ${to}`;
}

/** Array props whose items carry a non-empty string `id` — what a reference can point INTO. */
function keyedArrays(props: Record<string, unknown>): Map<string, Set<string>> {
  const keyed = new Map<string, Set<string>>();
  for (const [prop, value] of Object.entries(props)) {
    if (!Array.isArray(value)) continue;
    const ids = value
      .filter(isRecord)
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) keyed.set(prop, new Set(ids));
  }
  return keyed;
}

/** Every cross-array reference the component's own reference example demonstrates. */
function referencesIn(meta: ComponentMeta, example: Record<string, unknown>): Reference[] {
  const keyed = keyedArrays(example);
  if (keyed.size === 0) return [];

  // The fields holding an item's own words or its own identity are never references, even when a
  // component's ids and labels happen to be the same string.
  const notAReference = new Map<string, Set<string>>();
  for (const spec of meta.itemShapes ?? []) {
    const skip = new Set<string>([spec.idField ?? 'id', 'id']);
    if (spec.text) skip.add(spec.text);
    for (const alias of spec.textAliases ?? []) skip.add(alias);
    notAReference.set(spec.prop, skip);
  }
  // A field whose hint is a pipe enum is a closed VOCABULARY the renderer looks up — a component's
  // 'resistor', a node's 'start' — and those words sit in the same namespace as ids often enough
  // to look like references. `identitySpecs` draws the line the same way.
  const isVocabulary = (prop: string, field: string): boolean =>
    enumValuesFromHint(meta.propHints?.[`${prop}[].${field}`]) !== null;

  const found = new Map<string, Reference>();
  const add = (ref: Reference): void => {
    found.set(refKey(ref), ref);
  };
  for (const [prop, value] of Object.entries(example)) {
    if (!Array.isArray(value)) continue;
    const skip = notAReference.get(prop) ?? new Set<string>(['id']);
    for (const item of value) {
      if (!isRecord(item)) continue;
      for (const [field, raw] of Object.entries(item)) {
        if (skip.has(field) || isVocabulary(prop, field)) continue;
        const names = (Array.isArray(raw) ? raw : [raw]).filter(
          (one): one is string => typeof one === 'string' && one.length > 0,
        );
        if (names.length === 0) continue;
        for (const [to, ids] of keyed) {
          if (prop === to && field === 'id') continue;
          // EVERY value has to name that array, so a sentence sharing one word with an id is not
          // mistaken for a reference.
          if (names.every((name) => ids.has(name))) add({ prop, field, to });
        }
      }
    }
  }
  // A TOP-LEVEL prop naming one of those ids — a tree's `root`, a proof's conclusion — is the same
  // reference with a worse failure: the renderer's recursion never starts and the card is a title
  // over nothing. `refProps` is how it is declared.
  for (const [field, value] of Object.entries(example)) {
    if (typeof value !== 'string' || value.length === 0) continue;
    for (const [to, ids] of keyed) if (ids.has(value)) add({ prop: '', field, to });
  }
  return [...found.values()];
}

/** What the entry declares — `refs` on an item spec, `refProps` for a top-level prop. */
function declaredIn(meta: ComponentMeta): Set<string> {
  const declared = new Set<string>();
  for (const spec of meta.itemShapes ?? []) {
    const targets = typeof spec.refs?.to === 'string' ? [spec.refs.to] : (spec.refs?.to ?? []);
    for (const field of spec.refs?.fields ?? []) {
      for (const to of targets) declared.add(refKey({ prop: spec.prop, field, to }));
    }
    for (const field of spec.refProps ?? [])
      declared.add(refKey({ prop: '', field, to: spec.prop }));
  }
  return declared;
}

const CARRIERS = RAW_CATALOG.flatMap((meta) => {
  const example = EXAMPLES[meta.type];
  if (!isRecord(example)) return [];
  const references = referencesIn(meta, example);
  return references.length > 0 ? [{ meta, example, references }] : [];
});

describe('cross-array references', () => {
  it('covers a real slice of the catalog', () => {
    expect(CARRIERS.length).toBeGreaterThan(20);
  });

  it('every generically coerced component declares the references it carries', () => {
    // Identity is settled inside `coerceGeneric` alone, so `refs` is what a generic component's
    // references are resolved BY — and on a hand-written builder it would be inert metadata
    // describing code it cannot reach. Those builders own their endpoints and are held to it by
    // the round-trip below, which covers both kinds.
    const missing = CARRIERS.filter(({ meta }) => meta.coercer === 'generic').flatMap(
      ({ meta, references }) => {
        const declared = declaredIn(meta);
        const gaps = references.map(refKey).filter((key) => !declared.has(key));
        return gaps.length > 0 ? [`${meta.type}: ${gaps.join(', ')}`] : [];
      },
    );
    expect(missing).toEqual([]);
  });

  // A name the model could plausibly write where an id belongs: the target item's own label when
  // it differs from the id, otherwise the id in the other case. Either one must land back on the
  // id — the first proves label resolution, the second proves the case/whitespace pass.
  function driftedNames(example: Record<string, unknown>, meta: ComponentMeta, to: string) {
    const items = example[to];
    if (!Array.isArray(items)) return new Map<string, string>();
    const spec = (meta.itemShapes ?? []).find((one) => one.prop === to);
    const textField = spec?.text ?? (spec?.idIsContent ? undefined : 'label');
    const seen = new Map<string, number>();
    for (const item of items) {
      const text = isRecord(item) && textField ? item[textField] : undefined;
      if (typeof text === 'string' && text) seen.set(text, (seen.get(text) ?? 0) + 1);
    }
    const drift = new Map<string, string>();
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id) continue;
      const text = textField ? item[textField] : undefined;
      if (typeof text === 'string' && text && text !== item.id && seen.get(text) === 1) {
        drift.set(item.id, text);
        continue;
      }
      const flipped = /[a-z]/.test(item.id) ? item.id.toUpperCase() : item.id.toLowerCase();
      if (flipped !== item.id) drift.set(item.id, flipped);
    }
    return drift;
  }

  it.each(CARRIERS.map((c) => [c.meta.type, c] as const))(
    '%s: a reference written as the label still lands on the id',
    (type, { meta, example, references }) => {
      const props = structuredClone(example);
      // Only names that DO point at something are drifted. A reference the example leaves dangling
      // on purpose — a git parent from before the window — has to survive untouched.
      const injected = new Set<string>();
      const arrayRefs = references.filter((ref) => ref.prop !== '');
      for (const ref of arrayRefs) {
        const drift = driftedNames(example, meta, ref.to);
        const items = props[ref.prop];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (!isRecord(item)) continue;
          const raw = item[ref.field];
          const rewrite = (one: unknown): unknown => {
            const to = typeof one === 'string' ? drift.get(one) : undefined;
            if (to !== undefined) injected.add(to);
            return to ?? one;
          };
          item[ref.field] = Array.isArray(raw) ? raw.map(rewrite) : rewrite(raw);
        }
      }
      for (const ref of references.filter((one) => one.prop === '')) {
        const drift = driftedNames(example, meta, ref.to);
        const raw = props[ref.field];
        const to = typeof raw === 'string' ? drift.get(raw) : undefined;
        if (to !== undefined) {
          injected.add(to);
          props[ref.field] = to;
        }
      }
      if (injected.size === 0) return; // ids and labels coincide everywhere — nothing to prove.

      const result = validateLiveResponse(
        { title: 'T', blocks: [{ type, props }] },
        new Set([type]),
        12,
      );
      const block = result?.blocks.find((one) => one.type === type) as
        { props: Record<string, unknown> } | undefined;
      expect(block, `${type} was dropped once its references were written as labels`).toBeTruthy();

      // Every drifted name must be GONE from the referencing field — resolved back onto an id, not
      // left for a renderer to look up and miss. The arrays keep their length, so a reference that
      // "resolved" by taking the whole item with it is caught too.
      for (const ref of arrayRefs) {
        const before = example[ref.prop];
        const after = block!.props[ref.prop];
        if (!Array.isArray(before)) continue;
        expect(Array.isArray(after) ? after.length : 0, `${type}.${ref.prop} lost items`).toBe(
          before.length,
        );
        const targetIds = keyedArrays(block!.props).get(ref.to) ?? new Set<string>();
        for (const item of after as unknown[]) {
          if (!isRecord(item)) continue;
          const raw = item[ref.field];
          for (const one of Array.isArray(raw) ? raw : [raw]) {
            if (typeof one !== 'string' || !injected.has(one)) continue;
            expect.fail(
              `${type}.${ref.prop}[].${ref.field} still holds "${one}" — it names ${ref.to} but nothing resolved it onto one of ${[...targetIds].join(', ')}`,
            );
          }
        }
      }
      for (const ref of references.filter((one) => one.prop === '')) {
        const raw = block!.props[ref.field];
        if (typeof raw === 'string' && injected.has(raw)) {
          expect.fail(`${type}.${ref.field} still holds "${raw}" — it names a ${ref.to} id`);
        }
      }
    },
  );
});
