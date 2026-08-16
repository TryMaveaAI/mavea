// registry.ts — the world's cross-reference index: for every value, where it is used. Surfaces
// register their references; calc back-links are derived here from the values themselves (X feeds
// Y's formula ⇒ X is "used in" Y), so the provenance panel can always answer "what breaks if this
// number changes?" without any surface remembering to say so. The result is frozen — the registry
// is a snapshot, rebuilt when the world changes, never mutated in place.
import type { WorldValue } from './types';

export type UsedInSurface = 'view' | 'node' | 'edge' | 'block' | 'calc';

/** One place a value is used: which kind of surface, its id, and a human label for the list. */
export interface UsedInRef {
  surface: UsedInSurface;
  id: string;
  label: string;
}

/** A surface's registration of one use of one value. */
export interface UsedInSource {
  valueId: string;
  surface: UsedInSurface;
  id: string;
  label: string;
}

export interface TrustRegistry {
  values: ReadonlyMap<string, WorldValue>;
  usedIn: ReadonlyMap<string, readonly UsedInRef[]>;
}

export function buildRegistry(
  values: ReadonlyMap<string, WorldValue>,
  refs: Iterable<UsedInSource>,
): TrustRegistry {
  const usedIn = new Map<string, UsedInRef[]>();
  const add = (valueId: string, ref: UsedInRef): void => {
    if (!values.has(valueId)) return; // dangling reference — never index what doesn't exist
    const list = usedIn.get(valueId);
    if (list) list.push(Object.freeze(ref));
    else usedIn.set(valueId, [Object.freeze(ref)]);
  };
  for (const r of refs) add(r.valueId, { surface: r.surface, id: r.id, label: r.label });
  for (const v of values.values()) {
    if (v.kind !== 'calculated') continue;
    for (const input of v.calc.inputs) {
      add(input, { surface: 'calc', id: v.id, label: `input to ${v.label}` });
    }
  }
  for (const list of usedIn.values()) Object.freeze(list);
  return Object.freeze({ values, usedIn });
}
