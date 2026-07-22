import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_FACTS } from '../src/canvas/blocks/catalog/facts';

// The catalog's size is a fact; every number written about it in prose is a copy, and copies drift.
// This one drifted four ways at once — the README claimed 584 in one paragraph and 604 in the next,
// FEATURES said 584, ARCHITECTURE said 580, and the gallery rendered a fifth number — while the
// catalog itself held 600 the whole time. A reader has no way to tell which is real, so pin them to
// the source instead of trusting the next person to remember.
const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every three-digit count a doc states about the block library. */
function statedCounts(markdown: string): number[] {
  const counts: number[] = [];
  // Numbers sitting next to the words we use for the library, e.g. "**600 block types**",
  // "**600 component contracts**", "adds 570 components". Anything else in the doc is left alone.
  const pattern =
    /\*{0,2}(?:all\s+|adds\s+)?(\d{3})\b[^.\n]{0,40}?(?:block types|component contracts|types|components)\b/gi;
  for (const match of markdown.matchAll(pattern)) counts.push(Number(match[1]));
  return counts;
}

describe('documented block count', () => {
  const total = CATALOG_FACTS.length;
  // The docs legitimately quote two sizes: the whole catalog, and the extended library alone —
  // `canvas/blocks/` holds every family except `core`, whose renderers live in TopicCanvas's own
  // switch. Both are derived here so neither can be updated without the other being checked.
  const extended = CATALOG_FACTS.filter((fact) => fact.family !== 'core').length;
  const legitimate = new Set([total, extended]);

  it.each([['README.md'], ['docs/FEATURES.md'], ['ARCHITECTURE.md']])(
    '%s quotes only real catalog sizes',
    (path) => {
      const counts = statedCounts(read(path));
      expect(counts.length, `${path} should state a catalog size at least once`).toBeGreaterThan(0);
      for (const stated of counts) {
        expect(
          legitimate.has(stated),
          `${path} claims ${stated}; the catalog holds ${total} (${extended} outside core)`,
        ).toBe(true);
      }
    },
  );

  it('the README tells a reader the whole catalog size, not just the extended half', () => {
    expect(statedCounts(read('README.md'))).toContain(total);
  });

  it('the gallery offers every catalog type, so its count is the catalog count', async () => {
    // The gallery used to filter two types out, which made its "All" chip disagree with every
    // document above it. If a type is ever held back again, this is where it surfaces.
    const source = read('src/gallery/GalleryApp.tsx');
    expect(source).toContain('const ALL_TYPES = CATALOG_FACTS.map((fact) => fact.type);');
  });

  it('every catalog type has a gallery fixture, so all of them actually render', async () => {
    // A count is only honest if the tiles behind it draw something. `preview` and `composite` were
    // both exempt from this for exactly as long as they were exempt from the gallery.
    const { loadGalleryFixture } = await import('../src/gallery/fixtures.generated');
    const missing: string[] = [];
    for (const fact of CATALOG_FACTS) {
      const props = await loadGalleryFixture(fact.family, fact.type);
      if (!props) missing.push(fact.type);
    }
    expect(missing, 'types with no gallery fixture').toEqual([]);
  });
});
