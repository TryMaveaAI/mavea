import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { describe, it, expect } from 'vitest';
import type { ItemSpec } from '../src/canvas/blocks/catalog';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { referencePropsFor } from '../src/live/select/examples';
// The blank-card regression guard. A generic-coerced component advertises only its
// top-level prop names to the model, which then guesses what each item object looks like.
// A wrong guess (e.g. `{label}` where the renderer reads `it.text`) used to render a
// numbered-but-blank row (the "KEY PRINCIPLES … 0/4" bug). Each itemShape now teaches the
// exact field AND lets the coercer alias a synonym onto it. This test feeds every
// itemShape'd component the WORST realistic input — every item using a SYNONYM, never the
// canonical field — and asserts the coercer repairs it so the text survives. If a future
// edit drops an alias or renames a renderer field, the round-trip breaks here, not in prod.
const SHAPED = RAW_CATALOG.filter((m) => m.itemShapes && m.itemShapes.length > 0);
/** A throwaway string a render would show verbatim, unique per (component, prop, depth). */
function sample(tag: string): string {
  return `ITEMTEXT_${tag}`;
}
/** Build one item object using a SYNONYM (not the canonical `text` field) for every level,
 *  so a working coercer must alias it back. Recurses into a nested child array. A closedVocab
 *  text field is a renderer contract (logicmodel's five stages) — arbitrary ITEMTEXT_ strings
 *  are now correctly rejected there, so the fixture's own (valid) value rides the synonym key
 *  instead; landing back on the canonical field still proves the alias repair. */
function synonymItem(
  spec: ItemSpec,
  source: Record<string, unknown>,
  tag: string,
): Record<string, unknown> {
  const item: Record<string, unknown> = structuredClone(source);
  if (spec.text) {
    const payload = spec.closedVocab ? String(source[spec.text] ?? '') : sample(tag);
    // Use the LAST alias if any (a real synonym); otherwise fall back to the canonical key
    // (a component whose only accepted name IS the canonical can't be tested for aliasing,
    // but we still confirm the value passes through).
    const aliases = spec.textAliases ?? [];
    const key = aliases.length ? aliases[aliases.length - 1] : spec.text;
    for (const alias of aliases) item[alias] = payload;
    if (key !== spec.text) delete item[spec.text];
    item[key] = payload;
  }
  if (spec.children) {
    const children = source[spec.children.prop];
    item[spec.children.prop] = Array.isArray(children)
      ? children
          .filter(
            (child): child is Record<string, unknown> =>
              !!child && typeof child === 'object' && !Array.isArray(child),
          )
          .map((child, index) => synonymItem(spec.children!, child, `${tag}_CHILD_${index}`))
      : [];
  }
  return item;
}
describe('itemShape round-trip — model synonyms coerce to visible text', () => {
  it('covers a substantial slice of the catalog', () => {
    expect(SHAPED.length).toBeGreaterThan(50);
  });
  it.each(SHAPED.map((m) => [m.type, m] as const))(
    '%s: items using synonym field names keep their text after coercion',
    (type, meta) => {
      // Start from the real nested shape printed in the component prompt. Replace only each
      // canonical text key with a synonym; retaining sibling numeric/enum fields keeps this test
      // focused on alias repair while the structural validator independently enforces completeness.
      const reference = referencePropsFor(type);
      expect(reference, `${type} has no structural reference`).toBeTruthy();
      const props = structuredClone(reference!) as Record<string, unknown>;
      const testedProps = new Set<string>();
      for (const spec of meta.itemShapes!) {
        const source = props[spec.prop];
        // Some ItemSpecs describe an optional enrichment absent from the representative fixture.
        // The structural boundary drops such untyped optionals; there is no synonym path to test.
        if (!Array.isArray(source)) continue;
        testedProps.add(spec.prop);
        props[spec.prop] = (source as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === 'object' && !Array.isArray(item),
          )
          .map((item, index) => synonymItem(spec, item, `${type}_${spec.prop}_${index}`));
      }
      const result = validateLiveResponse(
        { title: 'T', blocks: [{ type, props }] },
        new Set([type]),
        12,
      );
      const block = result?.blocks.find((b) => b.type === type) as
        { props: Record<string, unknown> } | undefined;
      // The block must survive (its required item array is non-empty after repair)…
      expect(
        block,
        `${type} block was dropped — coercer failed to repair synonym items`,
      ).toBeTruthy();
      // …and every synonym text must have landed on the canonical field the renderer reads.
      for (const spec of meta.itemShapes!) {
        if (!testedProps.has(spec.prop)) continue;
        const arr = block!.props[spec.prop] as Array<Record<string, unknown>> | undefined;
        if (!arr && !meta.requires.includes(spec.prop)) continue;
        expect(arr, `${type}.${spec.prop} missing after coercion`).toBeTruthy();
        expect(arr!.length).toBeGreaterThan(0);
        if (spec.text) {
          for (const it of arr!) {
            const v = it[spec.text];
            // closedVocab fields carried the fixture's valid vocabulary value instead of an
            // ITEMTEXT_ marker; any non-blank value here still had to arrive via the synonym
            // key, since the canonical key was deleted from the authored item.
            const ok = spec.closedVocab
              ? typeof v === 'string' && v.trim() !== ''
              : typeof v === 'string' && v.startsWith('ITEMTEXT_');
            expect(
              ok,
              `${type}.${spec.prop}[].${spec.text} did not receive the synonym text (got ${JSON.stringify(v)})`,
            ).toBe(true);
          }
          if (spec.children) {
            // Children describe a nested shape, not a requirement on every parent item. For
            // example, lower-priority triage patients can omit vitals. Validate every child that
            // exists and require the representative fixture to exercise the nested path at least
            // once; do not invent an empty child list into a required field.
            const kids = arr!.flatMap((it) => {
              const value = it[spec.children!.prop];
              return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
            });
            expect(
              kids.length,
              `${type}.${spec.prop}[].${spec.children.prop} has no representative children`,
            ).toBeGreaterThan(0);
            // A nested child spec may itself have no `text` (a numeric/positional item array,
            // e.g. gellane's bands) — same as the top-level `if (spec.text)` guard above, only
            // check the synonym round-trip when the child spec actually declares a text field.
            if (spec.children.text) {
              for (const kid of kids) {
                const cv = kid[spec.children.text];
                expect(
                  typeof cv === 'string' && cv.startsWith('ITEMTEXT_'),
                  `${type} nested ${spec.children.prop}[].${spec.children.text} lost its text`,
                ).toBe(true);
              }
            }
          }
        }
      }
    },
  );
  it('drops a component whose items are ALL blank (never a numbered-but-empty card)', () => {
    // takeaways with items that have NO recognizable text field at all.
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'takeaways', props: { title: 'X', items: [{ foo: 1 }, { bar: 2 }] } }],
      },
      new Set(['takeaways']),
      12,
    );
    expect((r?.blocks ?? []).some((b) => b.type === 'takeaways')).toBe(false);
  });
});
