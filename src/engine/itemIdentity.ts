// itemIdentity.ts — unique ids for the item arrays a renderer keys by, and references that land
// on one.
//
// A graph component indexes its nodes by the id the model wrote. One omitted or repeated id
// therefore collapses several nodes onto a single entry, and what reaches the reader is a pile of
// overlapping labels at the SVG origin under a card of empty space. The layered renderers key by
// array index now (canvas/blocks/diagrams/layered), so nothing collapses there — but ids are
// still what the EDGES speak, and a set of stages carrying none has no flow left to draw.
//
// Both halves are repaired here, once, from what the catalog declares (`ItemSpec.idField` and
// `ItemSpec.refs`) and from what its own reference fixture shows (`identitySpecs`) — never from a
// list of block types. Nothing is rejected: a missing id is
// derived from the text the reader will see, a repeat is made unique, and a reference that still
// names nothing is left exactly as authored for the renderer to skip. Dropping those items
// instead would empty an array the component `requires`, which costs the whole card.
import type { ComponentMeta, ItemSpec } from '../canvas/blocks/catalog/meta';
import { enumValuesFromHint } from '../canvas/blocks/catalog/propHints';

/** Derived ids are keys, not prose — long enough to stay distinct, short enough to read in a
 *  debugger next to the label they came from. */
const MAX_DERIVED_ID = 48;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** An authored id or a visible text, as a key. A model that numbers its nodes writes `id: 1`
 *  about as often as `id: "1"`, a tree's values are numbers, and a number is a perfectly good key
 *  once it is one. */
function asKey(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** A key from an item's own visible text, so a stage labelled "Petroleum jelly" becomes
 *  `petroleum-jelly` — which is also what an edge naming that label resolves onto. */
function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_DERIVED_ID)
    .replace(/^-+|-+$/g, '');
}

/**
 * One id per element of an item array: the authored id where there is one, a slug of the item's
 * own text where there is not, and a positional key when the text yields no slug at all (a figure
 * labelled in a non-latin script).
 *
 * A repeated id goes to the item that wrote it FIRST, so an edge naming it still means what it
 * meant; the later ones derive. Every authored id is reserved before any is derived, so a derived
 * key can never steal one an edge already points at.
 */
export function deriveItemIds(
  items: readonly unknown[],
  idField: string,
  textOf: (item: Record<string, unknown>) => string,
): string[] {
  const authored = items.map((item) => (isRecord(item) ? asKey(item[idField]) : ''));
  const reserved = new Set(authored.filter(Boolean));
  const used = new Set<string>();
  return items.map((item, index) => {
    const own = authored[index];
    if (own && !used.has(own)) {
      used.add(own);
      return own;
    }
    const base = (isRecord(item) ? slugOf(textOf(item)) : '') || `item-${index + 1}`;
    let id = base;
    for (let n = 2; used.has(id) || reserved.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

/**
 * Resolve an authored reference onto one of the ids that were settled: the id itself, then
 * case/whitespace drift, then an unambiguous item TEXT — models routinely write
 * `{from: 'Crude oil', to: 'Distillation'}` against ids s1/s2, and an exact-id-only lookup
 * silently drops every such arrow. An ambiguous text (a decision figure's repeated "Yes")
 * resolves to nothing rather than to whichever item came first — and that holds even when one of
 * those items had its id DERIVED from that very text, so the loose lookup would otherwise find
 * `yes` and quietly pick the first of them.
 */
function refResolver(
  items: readonly unknown[],
  ids: readonly string[],
  textOf: (item: Record<string, unknown>) => string,
): (raw: unknown) => string | null {
  const exact = new Set(ids);
  const loose = new Map<string, string>();
  const byText = new Map<string, string | null>();
  ids.forEach((id, index) => {
    const key = id.toLowerCase();
    if (!loose.has(key)) loose.set(key, id);
    const item = items[index];
    const text = isRecord(item) ? textOf(item).trim().toLowerCase() : '';
    if (text) byText.set(text, byText.has(text) ? null : id);
  });
  return (raw: unknown): string | null => {
    const key = asKey(raw);
    if (!key) return null;
    if (exact.has(key)) return key;
    const lower = key.toLowerCase();
    if (byText.get(lower) === null) return null;
    return loose.get(lower) ?? byText.get(lower) ?? null;
  };
}

/** The text an item shows, read off the field its spec names — already aliased onto that field by
 *  the caller's own item normalization. */
function itemText(spec: ItemSpec): (item: Record<string, unknown>) => string {
  const field = spec.text;
  return (item) => (field ? asKey(item[field]) : '');
}

/**
 * The specs identity is settled against: the entry's own, plus `idField: 'id'` for every top-level
 * array whose reference fixture keys its items by an `id` and whose entry says nothing about
 * identity.
 *
 * Protection was opt-in per entry, so a renderer that indexed by id behind an entry that forgot
 * `idField` inherited none of it — a binary tree with one repeated id still drew its subtrees onto
 * one node. The reference already shows which arrays are keyed, so that is the default; a declared
 * spec only adds to it (a different field, the `refs` that name it). Three things are left alone:
 * an id whose hint is a closed vocabulary (a five-forces slot, a body region) is a NAME the
 * renderer looks up, not a key anything can invent; an id the reader SEES (`idIsContent`, a commit
 * hash) is content, not a key; and nested arrays, which `resolveItemIdentity` does not settle.
 */
export function identitySpecs(
  { itemShapes = [], propHints = {} }: Pick<ComponentMeta, 'itemShapes' | 'propHints'>,
  reference: object,
): ItemSpec[] {
  const keyed = new Set(
    Object.entries(reference).flatMap(([prop, value]) => {
      const first: unknown = Array.isArray(value) ? value[0] : undefined;
      const freeKey = isRecord(first) && typeof first.id === 'string';
      return freeKey && !enumValuesFromHint(propHints[`${prop}[].id`]) ? [prop] : [];
    }),
  );
  const declared = new Set(itemShapes.map((spec) => spec.prop));
  return [
    ...itemShapes.map((spec) =>
      !spec.idField && !spec.idIsContent && keyed.has(spec.prop)
        ? { ...spec, idField: 'id' }
        : spec,
    ),
    ...[...keyed].filter((prop) => !declared.has(prop)).map((prop) => ({ prop, idField: 'id' })),
  ];
}

/**
 * Settle the identity of every declared item array on a block's props, in place: ids first, then
 * the references that name them.
 *
 * `props` is the caller's own working copy; the arrays it holds are replaced with repaired ones
 * rather than mutated, so nothing the validator was handed is written through.
 */
export function resolveItemIdentity(
  props: Record<string, unknown>,
  shapes: readonly ItemSpec[],
): void {
  const resolvers = new Map<string, (raw: unknown) => string | null>();
  for (const spec of shapes) {
    const items = props[spec.prop];
    if (!spec.idField || !Array.isArray(items)) continue;
    const textOf = itemText(spec);
    const ids = deriveItemIds(items, spec.idField, textOf);
    props[spec.prop] = items.map((item, index) =>
      isRecord(item) ? { ...item, [spec.idField as string]: ids[index] } : item,
    );
    resolvers.set(spec.prop, refResolver(items, ids, textOf));
  }
  for (const spec of shapes) {
    const resolve = spec.idField && resolvers.get(spec.prop);
    if (!resolve) continue;
    for (const prop of spec.refProps ?? []) {
      if (props[prop] !== undefined) props[prop] = resolve(props[prop]) ?? props[prop];
    }
  }
  for (const spec of shapes) {
    const refs = spec.refs;
    const items = props[spec.prop];
    const resolve = refs && resolvers.get(refs.to);
    if (!refs || !resolve || !Array.isArray(items)) continue;
    props[spec.prop] = items.map((item) => {
      if (!isRecord(item)) return item;
      const out = { ...item };
      for (const field of refs.fields) {
        const value = out[field];
        if (value === undefined) continue;
        // A field holding a LIST of references (a node's children, a boundary's contents)
        // resolves element by element; one unresolvable entry never costs the others.
        if (Array.isArray(value)) out[field] = value.map((v) => resolve(v) ?? v);
        else out[field] = resolve(value) ?? value;
      }
      return out;
    });
  }
}
