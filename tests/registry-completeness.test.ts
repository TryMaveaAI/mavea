import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards the one silent failure mode of the extended block library: a new family ships its own
// registry.tsx but is never imported into blocks/index.ts, so it vanishes from EXTENDED_REGISTRY
// with no error. This source-scan keeps the manual barrel honest as families are added.
const blocksDir = join(dirname(fileURLToPath(import.meta.url)), '../src/canvas/blocks');

describe('canvas block registry barrel is complete', () => {
  it('imports every blocks/*/registry.tsx into index.ts', () => {
    const barrel = readFileSync(join(blocksDir, 'index.ts'), 'utf8');
    const families = readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(blocksDir, d.name, 'registry.tsx')))
      .map((d) => d.name);

    // Sanity: the library is large; if this collapses, the glob/path is wrong, not the barrel.
    expect(families.length).toBeGreaterThanOrEqual(20);

    const missing = families.filter((f) => !barrel.includes(`./${f}/registry`));
    expect(
      missing,
      `families with a registry.tsx that are not wired into blocks/index.ts: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
