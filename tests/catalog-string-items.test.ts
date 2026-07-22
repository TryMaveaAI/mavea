// catalog-string-items.test.ts — source-scan guardrail for the string-array coercion class.
//
// The bug class this pins: a renderer types a prop `string[]` (step lines, tips, column
// headers) but the catalog either (a) declares an `itemShapes` entry for it — so the
// coercer OBJECTIFIES every correctly-emitted plain string and the component throws on
// render ({text: …} as a React child; this is how a whole recipe once vanished) — or
// (b) leaves it untaught, so a model that objectifies the array crashes the card. Every
// `string[]` prop a generic-coerced component is taught must be covered by `stringItems`,
// and never by a text-bearing `itemShapes` spec. Scans the real family types against the
// catalog so a new block can't reintroduce the class.
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
const FAMILIES_DIR = join(__dirname, '../src/canvas/blocks');
/** type → its props-interface body, parsed from each family's types.ts. */
function propInterfaceBodies(): Map<string, string> {
  const typeToIface = new Map<string, string>();
  const ifaceBodies = new Map<string, string>();
  for (const entry of readdirSync(FAMILIES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const typesPath = join(FAMILIES_DIR, entry.name, 'types.ts');
    if (!existsSync(typesPath)) continue;
    const src = readFileSync(typesPath, 'utf8');
    for (const m of src.matchAll(/type:\s*'([a-z0-9]+)';\s*props:\s*(\w+)/g)) {
      typeToIface.set(m[1], m[2]);
    }
    for (const m of src.matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
      ifaceBodies.set(m[1], m[2]);
    }
  }
  const out = new Map<string, string>();
  for (const [type, iface] of typeToIface) {
    const body = ifaceBodies.get(iface);
    if (body) out.set(type, body);
  }
  return out;
}
/** The declared TS type of `prop` on the interface body, or null when absent. */
function fieldType(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`^\\s*${prop}\\??:\\s*([^;]+);`, 'm'));
  return m ? m[1].trim() : null;
}
const bodies = propInterfaceBodies();
const generics = RAW_CATALOG.filter((m) => m.coercer === 'generic' && bodies.has(m.type));
describe('catalog stringItems ↔ renderer prop types', () => {
  it('resolves prop interfaces for most generic types (scan sanity)', () => {
    expect(generics.length).toBeGreaterThan(400);
  });
  it('no text-bearing itemShapes spec targets a string[] prop (it would objectify it)', () => {
    const bad: string[] = [];
    for (const m of generics) {
      const body = bodies.get(m.type)!;
      for (const spec of m.itemShapes ?? []) {
        if (!spec.text) continue;
        const t = fieldType(body, spec.prop);
        if (t && /^string\[\]/.test(t)) bad.push(`${m.type}.${spec.prop}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('every taught string[] prop is covered by stringItems (else a wrong shape crashes it)', () => {
    const bad: string[] = [];
    for (const m of generics) {
      const body = bodies.get(m.type)!;
      const covered = new Set(m.stringItems ?? []);
      for (const prop of [...m.requires, ...m.optional]) {
        if (covered.has(prop)) continue;
        const t = fieldType(body, prop);
        if (t && /^string\[\]/.test(t)) bad.push(`${m.type}.${prop}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('every stringItems prop really is a string[] on its renderer (no drift)', () => {
    const bad: string[] = [];
    for (const m of generics) {
      const body = bodies.get(m.type)!;
      for (const prop of m.stringItems ?? []) {
        const t = fieldType(body, prop);
        if (t && !/^string\[\]/.test(t)) bad.push(`${m.type}.${prop} is ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
