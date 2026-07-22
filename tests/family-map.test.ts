// The per-family loader's map (canvas/blocks/familyMap.ts) is hand-maintained; the registries
// are the truth. This derives the real type→family mapping from every family registry and
// asserts the map matches in BOTH directions — a block added without its map line, a stale
// entry for a removed block, or a block filed under the wrong family all fail here, loudly,
// instead of silently rendering nothing at runtime. Also checks the families themselves stay
// in sync with the folders on disk, so a brand-new family can't be missed.
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FAMILY_OF, BLOCK_FAMILIES } from '../src/canvas/blocks/familyMap';

import { charts1Registry } from '../src/canvas/blocks/charts1/registry';
import { charts2Registry } from '../src/canvas/blocks/charts2/registry';
import { statsRegistry } from '../src/canvas/blocks/stats/registry';
import { tablesRegistry } from '../src/canvas/blocks/tables/registry';
import { flowsRegistry } from '../src/canvas/blocks/flows/registry';
import { docsRegistry } from '../src/canvas/blocks/docs/registry';
import { aiRegistry } from '../src/canvas/blocks/ai/registry';
import { mediaRegistry } from '../src/canvas/blocks/media/registry';
import { layoutRegistry } from '../src/canvas/blocks/layout/registry';
import { statusRegistry } from '../src/canvas/blocks/status/registry';
import { overlaysRegistry } from '../src/canvas/blocks/overlays/registry';
import { formsRegistry } from '../src/canvas/blocks/forms/registry';
import { pickersRegistry } from '../src/canvas/blocks/pickers/registry';
import { navRegistry } from '../src/canvas/blocks/nav/registry';
import { displayRegistry } from '../src/canvas/blocks/display/registry';
import { diagramsRegistry } from '../src/canvas/blocks/diagrams/registry';
import { learnRegistry } from '../src/canvas/blocks/learn/registry';
import { composeRegistry } from '../src/canvas/blocks/compose/registry';
import { everydayRegistry } from '../src/canvas/blocks/everyday/registry';
import { referenceRegistry } from '../src/canvas/blocks/reference/registry';
import { codeRegistry } from '../src/canvas/blocks/code/registry';
import { dashboardRegistry } from '../src/canvas/blocks/dashboard/registry';
import { financeRegistry } from '../src/canvas/blocks/finance/registry';

const REGISTRIES = {
  charts1: charts1Registry,
  charts2: charts2Registry,
  stats: statsRegistry,
  tables: tablesRegistry,
  flows: flowsRegistry,
  docs: docsRegistry,
  ai: aiRegistry,
  media: mediaRegistry,
  layout: layoutRegistry,
  status: statusRegistry,
  overlays: overlaysRegistry,
  forms: formsRegistry,
  pickers: pickersRegistry,
  nav: navRegistry,
  display: displayRegistry,
  diagrams: diagramsRegistry,
  learn: learnRegistry,
  compose: composeRegistry,
  everyday: everydayRegistry,
  reference: referenceRegistry,
  code: codeRegistry,
  dashboard: dashboardRegistry,
  finance: financeRegistry,
} as const;

describe('familyMap — the loader index matches the real registries, both directions', () => {
  it('every registry key has a map entry pointing at its own family', () => {
    const missing: string[] = [];
    const misfiled: string[] = [];
    for (const [family, registry] of Object.entries(REGISTRIES)) {
      for (const type of Object.keys(registry)) {
        if (!(type in FAMILY_OF)) missing.push(`${type} (${family})`);
        else if (FAMILY_OF[type] !== family)
          misfiled.push(`${type}: map says '${FAMILY_OF[type]}', registry is '${family}'`);
      }
    }
    expect(missing, `blocks missing from familyMap.ts:\n  ${missing.join('\n  ')}`).toEqual([]);
    expect(misfiled, `blocks filed under the wrong family:\n  ${misfiled.join('\n  ')}`).toEqual(
      [],
    );
  });

  it('every map entry corresponds to a real registry key (no stale lines)', () => {
    const stale = Object.entries(FAMILY_OF).filter(
      ([type, family]) => !(type in REGISTRIES[family]),
    );
    expect(
      stale.map(([t, f]) => `${t} → ${f}`),
      'familyMap.ts entries with no matching registry key',
    ).toEqual([]);
  });

  it('no block type appears in two family registries (the map could not disambiguate)', () => {
    const seen = new Map<string, string>();
    for (const [family, registry] of Object.entries(REGISTRIES)) {
      for (const type of Object.keys(registry)) {
        expect(seen.get(type), `'${type}' is in both '${seen.get(type)}' and '${family}'`).toBe(
          undefined,
        );
        seen.set(type, family);
      }
    }
  });

  it('BLOCK_FAMILIES matches the family folders on disk (a new family cannot be missed)', () => {
    const blocksDir = resolve(__dirname, '../src/canvas/blocks');
    const onDisk = readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(blocksDir, d.name, 'registry.tsx')))
      .map((d) => d.name)
      .sort();
    expect([...BLOCK_FAMILIES].sort()).toEqual(onDisk);
    expect(Object.keys(REGISTRIES).sort()).toEqual(onDisk);
  });
});
