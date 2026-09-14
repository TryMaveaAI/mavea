import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { identitySpecs, resolveItemIdentity } from '../src/engine/itemIdentity';
import type { ItemSpec } from '../src/canvas/blocks/catalog/meta';

// The reference examples are what the model is SHOWN, so a broken one is published as house style.
//
// `catalog-item-refs` already asks whether the catalog DECLARES the references an example carries.
// This asks the other half, and it is the half that was wrong: whether those references point at
// anything. They did not. `compact()` in `scripts/generate-reference-examples.mts` sliced every
// array at five items independently, so a `nodes` array was cut while `edges` kept naming the
// sixth — 31 dangling references across 18 components, every one manufactured by the generator out
// of a source fixture that was closed and correct. An orgchart demonstrated three children that
// were not there; a binary tree lost both of one node's subtrees; a family tree's `rootId` named
// nobody, so the exemplar for it rendered as a title over nothing; and `controlblockdiagram` — a
// card titled "Your Thermostat's Feedback Loop" whose footer describes the sensor feeding back —
// shipped its one feedback wire pointing at a `sensor` block the cap had removed, so the feedback
// loop was the one thing the feedback-loop example did not draw.
//
// It is the seam's own mistake told back to it: `resolveItemIdentity` leaves an unresolvable
// reference exactly as authored for the renderer to skip, and the renderers now skip it honestly —
// while the examples taught the model to write one. So the check runs the seam itself rather than
// re-deriving what a reference is: the ids are settled first, exactly as `coerceGeneric` settles
// them, and every declared reference is then looked up in what came out.
const EXAMPLES = JSON.parse(
  readFileSync('src/live/select/referenceExamples.generated.json', 'utf8'),
) as Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The ids each target array actually offers, read AFTER identity is settled — `deriveItemIds`
 *  fills a blank id in and de-duplicates a repeated one, so the authored values are not the
 *  keyset a reference is resolved against. */
function idsByProp(
  props: Record<string, unknown>,
  specs: readonly ItemSpec[],
): Map<string, Set<string>> {
  const ids = new Map<string, Set<string>>();
  for (const spec of specs) {
    const items = props[spec.prop];
    const field = spec.idField ?? (spec.idIsContent ? 'id' : null);
    if (!Array.isArray(items) || !field) continue;
    ids.set(
      spec.prop,
      new Set(
        items
          .filter(isRecord)
          .map((item) => item[field])
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
  }
  return ids;
}

/** `"a"` or `["a", "b"]` — a reference field holds either, and both resolve element by element. */
function namesIn(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (one): one is string => typeof one === 'string' && one.length > 0,
  );
}

interface Dangling {
  type: string;
  where: string;
  name: string;
}

const DANGLING: Dangling[] = [];
let checked = 0;

for (const meta of RAW_CATALOG) {
  const example = EXAMPLES[meta.type];
  if (!isRecord(example)) continue;
  const specs = identitySpecs(meta, example);
  if (specs.length === 0) continue;
  const props = structuredClone(example);
  resolveItemIdentity(props, specs);
  const ids = idsByProp(props, specs);

  for (const spec of specs) {
    const targets = spec.refs
      ? new Set(
          (typeof spec.refs.to === 'string' ? [spec.refs.to] : spec.refs.to).flatMap((to) => [
            ...(ids.get(to) ?? []),
          ]),
        )
      : null;
    // A reference to an array the example does not carry has nothing to be checked against — the
    // component declares it for a shape this fixture does not demonstrate.
    if (targets?.size) {
      const items = props[spec.prop];
      if (Array.isArray(items))
        for (const item of items.filter(isRecord))
          for (const field of spec.refs?.fields ?? [])
            for (const name of namesIn(item[field])) {
              checked++;
              if (!targets.has(name))
                DANGLING.push({ type: meta.type, where: `${spec.prop}[].${field}`, name });
            }
    }
    const own = ids.get(spec.prop);
    if (!own?.size) continue;
    for (const field of spec.refProps ?? [])
      for (const name of namesIn(props[field])) {
        checked++;
        if (!own.has(name)) DANGLING.push({ type: meta.type, where: field, name });
      }
  }
}

describe('reference examples', () => {
  it('checks a real slice of the catalog', () => {
    // A gate that stopped seeing the references would pass by looking at nothing, and this one was
    // written because eighteen components were broken in silence. Pin the coverage, not just the
    // verdict: the number only moves when a fixture does.
    expect(checked).toBeGreaterThan(80);
  });

  it('every reference a shipped example carries resolves to an item that is there', () => {
    expect(
      DANGLING.map(({ type, where, name }) => `${type}: ${where} names "${name}", which is absent`),
    ).toEqual([]);
  });
});
