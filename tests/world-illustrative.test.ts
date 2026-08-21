// A world built where nothing can be quoted is an explanation from general knowledge — which is what
// "illustrative" means. These pin the two halves of that: the gate deciding it from the corpus rather
// than taking the model's word, and the build ASKING for the right register in the first place.
import { describe, expect, it } from 'vitest';
import { buildCorpus, textCorpus, EMPTY_CORPUS } from '../src/live/ground/evidence';

describe('a corpus knows whether it can be quoted', () => {
  const src = (title: string, snippet?: string) => ({
    source: { kind: 'web' as const, title, url: `https://x.test/${title}` },
    text: snippet ?? '',
  });

  it('is NOT quotable when the sources contributed only their names', () => {
    // The live case, and the one that looks fine: native grounding returns a bare URL and a title,
    // so the corpus is non-empty — a list of headlines — and every figure checked against it fails.
    const corpus = buildCorpus([src('Ozone hole'), src('Montreal Protocol')], 6000);
    expect(corpus.text).not.toBe('');
    expect(corpus.quotable).toBe(false);
  });

  it('is quotable as soon as one source carries a sentence', () => {
    const corpus = buildCorpus(
      [src('Ozone hole'), src('Montreal Protocol', 'CFC-12 reached 540 ppt in 2000.')],
      6000,
    );
    expect(corpus.quotable).toBe(true);
  });

  it('treats a flat body of prose as quotable, and nothing as not', () => {
    expect(textCorpus('CFC-12 reached 540 ppt in 2000.').quotable).toBe(true);
    expect(textCorpus('   ').quotable).toBe(false);
    expect(EMPTY_CORPUS.quotable).toBe(false);
  });
});
