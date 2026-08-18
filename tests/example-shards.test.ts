import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { EXAMPLE_TYPES, SHARD_SIZE } from '../src/live/select/examples/index.generated';
import { SHARD_LOADERS } from '../src/live/select/examples/loaders.generated';
import {
  SHARD_COUNT,
  ensureExamples,
  exampleFor,
  referencePropsFor,
  shardOf,
} from '../src/live/select/examples';
import { COERCIBLE_TYPES, GENERATIVE_BLOCK_TYPES } from '../src/live/select';

const SOURCE_JSON: Record<string, unknown> = JSON.parse(
  readFileSync('src/live/select/referenceExamples.generated.json', 'utf8'),
);

// The reference-example props are stored twice on purpose, exactly like the block catalog's own
// facts/details split (tests/catalog-index.test.ts): a small always-resident TYPE INDEX (which
// shard holds a type) and on-demand SHARD modules (the actual demo-sourced props — the bytes that
// used to sit statically imported, and parsed-resident for the whole session, in every generateLive
// chunk). These guards mirror that file's: the shards can never go stale against the source JSON,
// every type is reachable through a shard, and the laziness the split exists for is real.

describe('the generated example shards cannot go stale', () => {
  it('regenerating from referenceExamples.generated.json reproduces the committed output exactly', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'mavea-examples-'));
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-example-shards.mts'], {
        stdio: 'ignore',
        env: { ...process.env, EXAMPLES_OUT_DIR: scratch },
      });
      const read = (p: string) => readFileSync(p, 'utf8');
      expect(
        read(`${scratch}/index.generated.ts`),
        'index.generated.ts is stale — run `pnpm gen:examples` and commit the result',
      ).toBe(read('src/live/select/examples/index.generated.ts'));
      expect(
        read(`${scratch}/loaders.generated.ts`),
        'example shard loaders are stale — run `pnpm gen:examples`',
      ).toBe(read('src/live/select/examples/loaders.generated.ts'));
      const shards = readdirSync(scratch).filter((f) => f.startsWith('shard'));
      for (const shard of shards) {
        expect(read(`${scratch}/${shard}`), `${shard} is stale — run \`pnpm gen:examples\``).toBe(
          read(`src/live/select/examples/${shard}`),
        );
      }
      expect(shards.length).toBe(SHARD_COUNT);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("carries exactly the source JSON's keys, in the same order", () => {
    expect(EXAMPLE_TYPES).toEqual(Object.keys(SOURCE_JSON));
  });

  it('every shard reproduces its slice of the source JSON exactly', async () => {
    for (let i = 0; i < SHARD_LOADERS.length; i++) {
      const { E } = await SHARD_LOADERS[i]!();
      for (const type of Object.keys(E)) {
        expect(E[type], `${type} in shard ${i}`).toEqual(SOURCE_JSON[type]);
      }
    }
  });
});

describe('the shard loader covers the whole example set', () => {
  it('every type maps into a real shard', () => {
    for (const type of EXAMPLE_TYPES) {
      const shard = shardOf(type);
      expect(shard, `${type} has no shard`).toBeGreaterThanOrEqual(0);
      expect(shard, `${type} points past the last shard`).toBeLessThan(SHARD_COUNT);
    }
  });

  it('shards cover the set exactly once, in canonical order', () => {
    expect(SHARD_COUNT).toBe(Math.ceil(EXAMPLE_TYPES.length / SHARD_SIZE));
  });

  it('an unknown type has no shard', () => {
    expect(shardOf('definitely-not-a-block')).toBe(-1);
  });

  it('ensureExamples tolerates unknown types without throwing', async () => {
    await expect(ensureExamples(['definitely-not-a-block', ''])).resolves.toBeUndefined();
  });

  it('a menu of ~30 offerable types touches far fewer shards than the library has', async () => {
    // The bound that matters: fetched shards scale with the MENU (~30 hero candidates a turn ever
    // ranks), not with the library (613 types) — the whole point of the split.
    const offerable = [...COERCIBLE_TYPES].filter((t) => !GENERATIVE_BLOCK_TYPES.has(t));
    const menu = offerable.slice(0, 30);
    await ensureExamples(menu);
    const shards = new Set(menu.map(shardOf));
    expect(shards.size).toBeLessThanOrEqual(menu.length);
    expect(shards.size).toBeLessThan(SHARD_COUNT);
  });
});

describe('referencePropsFor / exampleFor round-trip the source data', () => {
  it('every type in the source JSON round-trips through referencePropsFor once loaded', async () => {
    await ensureExamples(EXAMPLE_TYPES);
    for (const type of EXAMPLE_TYPES) {
      expect(referencePropsFor(type), type).toEqual(SOURCE_JSON[type]);
    }
  });

  it('exampleFor still returns null, not the compacted shape, for an unknown type', () => {
    expect(exampleFor('definitely-not-a-block')).toBeNull();
  });
});

describe('the shard split is real, not just an API that happens to work', () => {
  // The bug this whole file guards against: examples.ts used to `import REFERENCE_EXAMPLES from
  // './referenceExamples.generated.json'`, a 384 KB static import that rode into every
  // generateLive chunk and stayed parsed-resident for the session. Source-level checks pin that it
  // cannot silently come back — the round-trip tests above would still pass even if every shard
  // were statically imported instead of dynamically loaded.
  it('examples.ts never statically imports the flat reference JSON', () => {
    const src = readFileSync('src/live/select/examples.ts', 'utf8');
    expect(src).not.toMatch(/from\s+['"].*referenceExamples\.generated\.json['"]/);
  });

  it('shard loaders use dynamic import(), never a static import', () => {
    const src = readFileSync('src/live/select/examples/loaders.generated.ts', 'utf8');
    expect(src).toMatch(/=>\s*import\('\.\/shard\d{3}'\)/);
    expect(src).not.toMatch(/^\s*import\s.*from\s+['"]\.\/shard/m);
  });
});
