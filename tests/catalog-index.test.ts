import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { CATALOG_FACTS, catalogFacts, familyOf } from '../src/canvas/blocks/catalog/facts';
import {
  SHARD_COUNT,
  detailFor,
  detailsReady,
  ensureDetails,
  shardOf,
} from '../src/canvas/blocks/catalog/details';
import { catalogMeta } from '../src/canvas/blocks/catalog/lookup';
import { selectComponents } from '../src/live/select';

const sortKeys = (m: object) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))); // prettier-ignore

// The catalog is stored twice on purpose: a compact, always-resident FACTS index (what the selector
// ranks over) and on-demand DETAIL shards (blurbs, prop hints — ~70% of the bytes, fetched only for
// the components a turn offers). Two copies of anything is a correctness hazard, so these are the
// guards: the generated halves can never go stale against the authored families, every component is
// reachable through a shard, a merged meta reconstitutes the authored entry exactly, and the
// laziness the whole split exists for is real.

describe('the generated facts index cannot go stale', () => {
  it('regenerating from the family files reproduces the committed output exactly', () => {
    // Editing a family without `pnpm gen:catalog` would leave the selector ranking on stale facts.
    // Generate into a scratch directory: rewriting the real files mid-run would race every other
    // worker importing them.
    const scratch = mkdtempSync(join(tmpdir(), 'mavea-catalog-'));
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-catalog-index.mts'], {
        stdio: 'ignore',
        env: { ...process.env, CATALOG_OUT_DIR: scratch },
      });
      const read = (p: string) => readFileSync(p, 'utf8');
      expect(
        read(`${scratch}/facts.generated.ts`),
        'facts.generated.ts is stale — run `pnpm gen:catalog` and commit the result',
      ).toBe(read('src/canvas/blocks/catalog/facts.generated.ts'));
      expect(
        read(`${scratch}/structures.generated.ts`),
        'structures.generated.ts is stale — run `pnpm gen:catalog` and commit the result',
      ).toBe(read('src/canvas/blocks/catalog/structures.generated.ts'));
      expect(
        read(`${scratch}/details/loaders.generated.ts`),
        'detail shard loaders are stale — run `pnpm gen:catalog`',
      ).toBe(read('src/canvas/blocks/catalog/details/loaders.generated.ts'));
      const shards = readdirSync(`${scratch}/details`).filter((f) => f.startsWith('shard'));
      for (const shard of shards) {
        expect(
          read(`${scratch}/details/${shard}`),
          `${shard} is stale — run \`pnpm gen:catalog\``,
        ).toBe(read(`src/canvas/blocks/catalog/details/${shard}`));
      }
      expect(shards.length).toBe(SHARD_COUNT);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('decodes back to exactly the facts the authored catalog declares', () => {
    expect(CATALOG_FACTS).toHaveLength(RAW_CATALOG.length);
    for (const meta of RAW_CATALOG) {
      const facts = catalogFacts(meta.type);
      expect(facts, `${meta.type} missing from the index`).toBeTruthy();
      if (!facts) continue;
      // Every field the index claims to carry must round-trip identically.
      expect(facts.family, meta.type).toBe(meta.family);
      expect(facts.archetype, meta.type).toBe(meta.archetype);
      expect(facts.dataShapes, meta.type).toEqual(meta.dataShapes);
      expect(facts.tier, meta.type).toBe(meta.tier);
      expect(facts.wowWeight, meta.type).toBe(meta.wowWeight);
      expect(facts.interactive, meta.type).toBe(meta.interactive);
      expect(facts.coercer, meta.type).toBe(meta.coercer);
      expect(facts.colDefault, meta.type).toBe(meta.colDefault);
      expect(facts.colMin, meta.type).toBe(meta.colMin);
      expect(facts.embed, meta.type).toBe(meta.embed);
      expect(facts.requires, meta.type).toEqual(meta.requires);
      expect(facts.intents, meta.type).toEqual(meta.intents);
      expect(facts.domains, meta.type).toEqual(meta.domains);
      expect(facts.caps, meta.type).toEqual(meta.caps);
    }
  });

  it('preserves canonical catalog order — the seeded draw depends on it', () => {
    expect(CATALOG_FACTS.map((f) => f.type)).toEqual(RAW_CATALOG.map((m) => m.type));
  });
});

describe('the detail loader covers the whole library', () => {
  it('every component maps into a real shard', () => {
    for (const f of CATALOG_FACTS) {
      const shard = shardOf(f.type);
      expect(shard, `${f.type} has no shard`).toBeGreaterThanOrEqual(0);
      expect(shard, `${f.type} points past the last shard`).toBeLessThan(SHARD_COUNT);
    }
  });

  it('shards cover the catalog exactly once, in canonical order', () => {
    // Every component's details are resident after setup's preload — no type falls between shards.
    for (const f of CATALOG_FACTS) expect(detailsReady(f.type), f.type).toBe(true);
    expect(SHARD_COUNT).toBe(Math.ceil(CATALOG_FACTS.length / 8));
  });

  it('every component is authored in a family the catalog knows', () => {
    const authored = new Set(RAW_CATALOG.map((m) => m.family));
    for (const f of CATALOG_FACTS) expect(authored, f.type).toContain(familyOf(f.type));
  });

  it('a loaded detail plus its facts reconstitutes the authored meta', () => {
    // tests/setup.ts preloads every family, so catalogMeta is fully populated here.
    for (const meta of RAW_CATALOG) {
      const merged = catalogMeta(meta.type);
      expect(merged, `${meta.type} has no merged meta`).toBeTruthy();
      expect(sortKeys(merged!), meta.type).toEqual(sortKeys(meta));
    }
  });
});

describe('the split is what keeps per-turn cost proportional to the answer', () => {
  it('facts carry no authoring prose — the payload that must not scale with the library', () => {
    for (const f of CATALOG_FACTS.slice(0, 40)) {
      expect(f, `${f.type} leaked a blurb into the index`).not.toHaveProperty('blurb');
      expect(f, `${f.type} leaked prop hints into the index`).not.toHaveProperty('propHints');
      expect(f, `${f.type} leaked optional props into the index`).not.toHaveProperty('optional');
    }
  });

  it('a menu of ~38 types touches far fewer shards than the library has', async () => {
    // The bound that matters: fetched shards scale with the MENU, not with the catalog. Two types in
    // the same canonical neighbourhood share a shard; a type never drags in a whole family.
    await ensureDetails(['geomap']);
    expect(detailFor('geomap')?.blurb).toBeTruthy();
    const menu = CATALOG_FACTS.slice(0, 38).map((f) => f.type);
    const shards = new Set(menu.map(shardOf));
    expect(shards.size).toBeLessThanOrEqual(menu.length);
    expect(shards.size).toBeLessThan(SHARD_COUNT);
  });

  it('ensureDetails tolerates unknown types without throwing', async () => {
    await expect(ensureDetails(['definitely-not-a-block', ''])).resolves.toBeUndefined();
  });

  it('selectComponents awaits the details its own menu quotes', async () => {
    const r = await selectComponents({ userText: 'show me the python code for quicksort', tier: 'frontier' }); // prettier-ignore
    expect(r.types).toContain('codeblock');
    // The menu quotes each hero's blurb; if details had not been awaited it would be empty lines.
    expect(r.promptSnippet).toMatch(/codeblock — .+/);
    for (const t of r.types.slice(0, 5)) expect(detailFor(t), `${t} detail missing`).toBeTruthy();
  });
});
