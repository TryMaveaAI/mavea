// The baked tour corpus arrives via a lazy chunk (loadTourCorpus in src/tour/corpus/index.ts) so
// the Live mount stays lean — which means a deep-linked ?tour=1 auto-start could race the fetch.
// The driver holds its chapter-apply and auto-advance effects on a corpusReady flag: without the
// hold, a chapter would apply against an empty corpus (tourFrame → null) and silently skip every
// baked frame while the advance clock marched on.
//
// Like tour-answer-cold-unlock.test.ts, this can't be proven by mounting the hook (it needs a
// real chunk fetch racing a chapter entry) — asserted by source inspection instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('the tour driver waits for the lazy corpus chunk before playing chapters', () => {
  const src = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');

  it('kicks off the corpus fetch as soon as the tour is active, cleanup-guarded', () => {
    // The .then must flip corpusReady only while the effect is still live (the alive flag), so a
    // dismissed tour never sets state on an unmounted driver.
    expect(src).toMatch(
      /void loadTourCorpus\(\)\.then\(\(\) => \{\s*if \(alive\) setCorpusReady\(true\);/,
    );
  });

  it('holds the chapter-apply effect until the corpus has loaded', () => {
    expect(src).toMatch(/if \(!active \|\| !started \|\| done \|\| !corpusReady\) return;/);
  });

  it('holds the auto-advance clock until the corpus has loaded', () => {
    expect(src).toMatch(
      /if \(!active \|\| !started \|\| done \|\| !playing \|\| !corpusReady\) return;/,
    );
  });
});
