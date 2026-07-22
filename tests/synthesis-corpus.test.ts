import { describe, expect, it } from 'vitest';
import {
  termSet,
  jaccard,
  topTerms,
  extractNumbers,
  numberOfFamily,
  populationBucket,
  timeframeKey,
  scopeConflict,
  citationLabel,
} from '../src/live/prism/synthesis/corpus';
import {
  crossSourceCandidates,
  connectedComponents,
  type ClaimLite,
} from '../src/live/prism/synthesis/candidates';
import {
  judgeContradiction,
  classifyGap,
  distinctSourceCount,
  passesConsensus,
} from '../src/live/prism/synthesis/gate';
import {
  textCoversFacet,
  scanFacetCoverage,
  buildGaps,
  parseFacets,
} from '../src/live/prism/synthesis/gaps';
import { corpusCandidates } from '../src/live/prism/synthesis/ingest';
import { normalizePdfText } from '../src/live/prism/grounding';
import type { Claim } from '../src/live/prism/types';
import type { ExpectedFacet } from '../src/live/prism/synthesis/types';

// The Synthesis World's honesty is pure code: candidate generation reduces the corpus to a few
// comparable pairs, and the gates decide what is actually shown. These pin the behaviours that keep it
// from ever fabricating a contradiction, a gap, or a consensus.

// ── corpus.ts ─────────────────────────────────────────────────────────────────────────────────────
describe('corpus terms', () => {
  it('tokenizes ≥4-char words and scores overlap', () => {
    expect(termSet('The efficacy improved markedly')).toEqual(
      new Set(['efficacy', 'improved', 'markedly']),
    );
    const a = termSet('pediatric efficacy trial results');
    const b = termSet('pediatric efficacy safety data');
    expect(jaccard(a, b)).toBeCloseTo(2 / 6, 5);
    expect(jaccard(new Set(), a)).toBe(0);
  });
  it('ranks top terms by frequency', () => {
    expect(topTerms('cost cost cost price price value', 2)).toEqual(['cost', 'price']);
  });
});

describe('extractNumbers', () => {
  it('reads percentages, money, doses, and scaled magnitudes', () => {
    expect(extractNumbers('improved 42% at follow-up')[0]).toMatchObject({
      value: 42,
      family: 'pct',
    });
    expect(extractNumbers('total net revenue $10,253')[0]).toMatchObject({
      value: 10253,
      family: 'money',
    });
    expect(extractNumbers('a 50 mg dose')[0]).toMatchObject({ value: 50, family: 'dose' });
    expect(extractNumbers('2.1 billion users')[0]).toMatchObject({ value: 2_100_000_000 });
  });
  it('finds a number of a requested family, or null', () => {
    expect(numberOfFamily('grew 12% over 24 weeks', 'pct')?.value).toBe(12);
    expect(numberOfFamily('no figure here', 'pct')).toBeNull();
  });
});

describe('scope', () => {
  it('reads population and timeframe buckets', () => {
    expect(populationBucket('effect in children under 18')).toBe('pediatric');
    expect(populationBucket('a cohort of adults')).toBe('adult');
    expect(populationBucket('general population')).toBeNull();
    expect(timeframeKey('measured at 12 weeks')).toBe('12week');
    expect(timeframeKey('a phase 3 trial')).toBe('phase3');
  });
  it('flags a conflict only when both sides pin the SAME axis to DIFFERENT values', () => {
    expect(scopeConflict('effect in children', 'response in adults')).toBe('population');
    expect(scopeConflict('at 12 weeks', 'at 24 weeks')).toBe('timeframe');
    // one side silent → never a conflict (silence isn't disagreement)
    expect(scopeConflict('improved outcomes', 'response in adults')).toBeNull();
    expect(scopeConflict('at 12 weeks in adults', 'at 12 weeks in adults')).toBeNull();
  });
  it('derives an author-year citation label when present', () => {
    expect(citationLabel('Foci et al. 2024 reported that…')).toBe('Foci et al. 2024');
    expect(citationLabel('a plain document with no citation')).toBe('');
  });
});

// ── candidates.ts ─────────────────────────────────────────────────────────────────────────────────
describe('crossSourceCandidates', () => {
  const claims: ClaimLite[] = [
    { id: 'a', source: 0, text: 'pediatric efficacy improved at twelve weeks' },
    { id: 'b', source: 1, text: 'pediatric efficacy showed no improvement in the trial' },
    { id: 'c', source: 2, text: 'manufacturing cost dispute over pricing' },
    { id: 'd', source: 0, text: 'pediatric efficacy improved at twelve weeks' }, // same source as a
  ];
  it('recalls the planted cross-source overlapping pair', () => {
    const pairs = crossSourceCandidates(claims, { minOverlap: 0.1 });
    expect(pairs.some((p) => (p.a === 'a' && p.b === 'b') || (p.a === 'b' && p.b === 'a'))).toBe(
      true,
    );
  });
  it('never pairs claims from the same source', () => {
    const pairs = crossSourceCandidates(claims, { minOverlap: 0.01 });
    expect(pairs.some((p) => new Set([p.a, p.b]).size === 2 && p.a === 'a' && p.b === 'd')).toBe(
      false,
    );
  });
  it('drops the unrelated cost claim below threshold and caps to topK', () => {
    const pairs = crossSourceCandidates(claims, { minOverlap: 0.3, topK: 1 });
    expect(pairs.length).toBeLessThanOrEqual(1);
    expect(pairs.every((p) => p.a !== 'c' && p.b !== 'c')).toBe(true);
  });
});

describe('connectedComponents', () => {
  it('groups agreeing pairs into clusters and omits singletons', () => {
    const groups = connectedComponents([
      { a: 'x', b: 'y' },
      { a: 'y', b: 'z' },
      { a: 'p', b: 'q' },
    ]);
    expect(groups).toContainEqual(['x', 'y', 'z']);
    expect(groups).toContainEqual(['p', 'q']);
    expect(groups.flat()).not.toContain('lonely');
  });
});

// ── gate.ts ───────────────────────────────────────────────────────────────────────────────────────
function claim(over: Partial<Claim>): Claim {
  return {
    id: 'c',
    quote: '',
    page: 1,
    kind: 'finding',
    title: 't',
    ask: 'a',
    role: 'supporting',
    region: 't0',
    source: 0,
    ...over,
  };
}

describe('judgeContradiction', () => {
  it('keeps a HARD contradiction when comparable, verified, and same scope', () => {
    const a = claim({
      id: 'a',
      source: 0,
      quote: '42% improvement at 12 weeks on the primary endpoint',
    });
    const b = claim({
      id: 'b',
      source: 1,
      quote: 'no significant effect at 12 weeks on the primary endpoint',
    });
    const v = judgeContradiction(
      {
        relation: 'contradicts',
        comparable: true,
        matchPhrase: 'at 12 weeks on the primary endpoint',
      },
      a,
      b,
      [a.quote],
      [b.quote],
    );
    expect(v).not.toBeNull();
    expect(v!.relation).toBe('contradicts');
    expect(v!.comparable).toBe(true);
    expect(v!.matchPhrase).toContain('primary endpoint');
  });

  it('DOWNGRADES to in-tension when populations conflict — the killer false-positive defense', () => {
    const a = claim({ id: 'a', source: 0, quote: '42% improvement in adults' });
    const b = claim({ id: 'b', source: 1, quote: 'no effect in children' });
    const v = judgeContradiction(
      { relation: 'contradicts', comparable: true, matchPhrase: 'improvement' },
      a,
      b,
      [a.quote],
      [b.quote],
    );
    expect(v!.relation).toBe('in-tension');
    expect(v!.comparable).toBe(false);
    expect(v!.caveat).toBe('population');
  });

  it('DOWNGRADES when the match phrase is not verbatim in both sources', () => {
    const a = claim({ id: 'a', source: 0, quote: 'sales rose to $10,253 this year' });
    const b = claim({ id: 'b', source: 1, quote: 'sales fell to $8,000 this year' });
    const v = judgeContradiction(
      { relation: 'contradicts', comparable: true, matchPhrase: 'a phrase in neither source' },
      a,
      b,
      [a.quote],
      [b.quote],
    );
    expect(v!.relation).toBe('in-tension');
    expect(v!.comparable).toBe(false);
    expect(v!.caveat).toBe('scope');
    // still annotates the honest numeric delta
    expect(v!.delta).toMatchObject({ aValue: 10253, bValue: 8000 });
  });

  it('treats EQUAL numbers as agreement, never a contradiction', () => {
    const a = claim({ id: 'a', source: 0, quote: 'response rate was 42%' });
    const b = claim({ id: 'b', source: 1, quote: 'response rate of 42%' });
    const v = judgeContradiction(
      { relation: 'contradicts', comparable: true, matchPhrase: 'response rate' },
      a,
      b,
      [a.quote],
      [b.quote],
    );
    expect(v!.relation).toBe('in-tension');
    expect(v!.delta).toBeUndefined();
  });

  it('returns null for agreement or same-source pairs', () => {
    const a = claim({ id: 'a', source: 0, quote: 'x' });
    const b = claim({ id: 'b', source: 1, quote: 'y' });
    expect(judgeContradiction({ relation: 'agrees' }, a, b, ['x'], ['y'])).toBeNull();
    const same = claim({ id: 'c', source: 0, quote: 'y' });
    expect(judgeContradiction({ relation: 'contradicts' }, a, same, ['x'], ['y'])).toBeNull();
  });
});

describe('classifyGap', () => {
  it('asserts absence only at a literal zero, with enough synonyms and a real corpus', () => {
    expect(classifyGap(0, 84, 4)).toBe('absent');
    expect(classifyGap(1, 84, 4)).toBe('thin'); // 1 of 84 ≤ 10%
    expect(classifyGap(40, 84, 4)).toBeNull(); // well covered
    expect(classifyGap(0, 84, 2)).toBeNull(); // too few surface forms → never assert absence
    expect(classifyGap(0, 2, 4)).toBeNull(); // corpus too small to claim a gap
    expect(classifyGap(1, 6, 4)).toBeNull(); // "thin" needs a corpus of ≥10
  });
});

describe('consensus counting', () => {
  it('counts DISTINCT sources, not claims', () => {
    const sourceOf = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 1],
    ]);
    expect(distinctSourceCount(['a', 'b', 'c'], sourceOf)).toBe(2);
    expect(passesConsensus(2)).toBe(true);
    expect(passesConsensus(1)).toBe(false);
  });
});

// ── gaps.ts ───────────────────────────────────────────────────────────────────────────────────────
const pediatric: ExpectedFacet = {
  id: 'f0',
  label: 'Pediatric population',
  surfaceForms: ['pediatric', 'paediatric', 'children', 'under 18'],
};

describe('gap coverage scan', () => {
  it('matches whole tokens only, and multi-word forms', () => {
    expect(
      textCoversFacet(normalizePdfText('a study of children with the condition'), pediatric),
    ).toBe(true);
    expect(textCoversFacet(normalizePdfText('patients under 18 were excluded'), pediatric)).toBe(
      true,
    );
    // "pediatric" must NOT match inside "orthopediatric"
    expect(textCoversFacet(normalizePdfText('the orthopediatricians met'), pediatric)).toBe(false);
    expect(textCoversFacet(normalizePdfText('an adult-only cohort'), pediatric)).toBe(false);
  });

  it('counts covering sources and dissolves the gap when a synonym appears', () => {
    const noCoverage = [
      'adult trial one',
      'adult trial two',
      'adult trial three',
      'adult trial four',
    ].map(normalizePdfText);
    expect(scanFacetCoverage(pediatric, noCoverage).coveredCount).toBe(0);
    const gaps = buildGaps([pediatric], noCoverage, () => 't0');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe('absent');
    expect(gaps[0].coveredCount).toBe(0);

    // add a source that mentions "paediatric" (a synonym) → the gap must dissolve
    const withOne = [...noCoverage, normalizePdfText('a paediatric sub-study followed')];
    expect(buildGaps([pediatric], withOne, () => 't0')).toHaveLength(0);
  });
});

describe('parseFacets', () => {
  it('keeps well-formed facets and drops the malformed', () => {
    const facets = parseFacets([
      { label: 'Long-term outcomes', surfaceForms: ['long-term', 'long term', 'follow-up'] },
      { label: '', surfaceForms: ['x'] }, // no label
      { label: 'Bad', surfaceForms: [] }, // no forms
      'nonsense',
    ]);
    expect(facets).toHaveLength(1);
    expect(facets[0].label).toBe('Long-term outcomes');
    expect(facets[0].surfaceForms).toContain('follow-up');
  });
});

// ── ingest.ts ─────────────────────────────────────────────────────────────────────────────────────
describe('corpusCandidates', () => {
  it('keeps explodable files and drops images, folder noise, and unknown types', () => {
    const files = [
      new File(['a'], 'paper.pdf'),
      new File(['b'], 'notes.md'),
      new File(['c'], 'data.csv'),
      new File(['d'], 'slides.pptx'),
      new File(['e'], 'photo.png'), // image → not a corpus source
      new File(['f'], 'archive.bin'), // unknown → dropped
    ];
    const kept = corpusCandidates(files).map((f) => f.name);
    expect(kept).toEqual(['paper.pdf', 'notes.md', 'data.csv', 'slides.pptx']);
  });

  it('skips node_modules / .git / OS noise by path', () => {
    const mk = (name: string, rel: string): File => {
      const f = new File(['x'], name);
      Object.defineProperty(f, 'webkitRelativePath', { value: rel });
      return f;
    };
    const files = [
      mk('index.ts', 'proj/node_modules/pkg/index.ts'),
      mk('config.ts', 'proj/.git/config.ts'),
      mk('real.md', 'proj/docs/real.md'),
    ];
    expect(corpusCandidates(files).map((f) => f.name)).toEqual(['real.md']);
  });
});
