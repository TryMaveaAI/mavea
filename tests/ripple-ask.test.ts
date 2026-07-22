import { describe, expect, it } from 'vitest';
import { gateCitations, rankRepoFiles } from '../src/live/ripple/ask/repoAsk';

// gateCitations is the anti-hallucination gate for a repo Ask answer: a citation whose quote is
// VERBATIM in the named file's fetched text (or the diff) is trusted; one that isn't is still shown
// — labeled `unpinned` — never silently trusted and never silently dropped. Mirrors Prism's
// groundSpans (tests/prism-ask.test.ts), adapted from page numbers to file paths.
describe('gateCitations', () => {
  const files = new Map([
    [
      'src/auth/token.ts',
      'export function validateToken(t: string, opts: VerifyOpts) { return t; }',
    ],
    ['src/api/guard.ts', 'if (!validateToken(tok, {})) throw new Error("denied");'],
  ]);

  it('accepts a citation whose quote is verbatim in the named file', () => {
    const out = gateCitations(
      [{ file: 'src/auth/token.ts', quote: 'validateToken(t: string, opts: VerifyOpts)' }],
      files,
      '',
    );
    expect(out).toEqual([
      { file: 'src/auth/token.ts', quote: 'validateToken(t: string, opts: VerifyOpts)' },
    ]);
  });

  it('labels a paraphrased/invented quote unpinned instead of dropping it', () => {
    const out = gateCitations(
      [{ file: 'src/auth/token.ts', quote: 'this function always throws on a bad token' }],
      files,
      '',
    );
    expect(out).toEqual([
      {
        file: 'src/auth/token.ts',
        quote: 'this function always throws on a bad token',
        unpinned: true,
      },
    ]);
  });

  it('falls back to the diff text when the file itself was never fetched', () => {
    const out = gateCitations(
      [{ file: 'src/web/fetchWrapper.ts', quote: 'retries once on a 401' }],
      files,
      'diff --git a/src/web/fetchWrapper.ts\n+  // retries once on a 401 by refreshing\n',
    );
    expect(out).toEqual([{ file: 'src/web/fetchWrapper.ts', quote: 'retries once on a 401' }]);
  });

  it('de-duplicates identical citations', () => {
    const dupe = { file: 'src/auth/token.ts', quote: 'validateToken(t: string, opts: VerifyOpts)' };
    const out = gateCitations([dupe, dupe], files, '');
    expect(out).toHaveLength(1);
  });

  it('caps the number of citations so an answer never floods the eye', () => {
    const raw = Array.from({ length: 9 }, (_, i) => ({
      file: 'src/api/guard.ts',
      quote: `marker${i}`,
    }));
    const withMarkers = new Map(files).set(
      'src/api/guard.ts',
      Array.from({ length: 9 }, (_, i) => `marker${i}`).join(' '),
    );
    expect(gateCitations(raw, withMarkers, '')).toHaveLength(6);
  });

  it('ignores a non-array or malformed input', () => {
    expect(gateCitations(null, files, '')).toEqual([]);
    expect(gateCitations([{ file: 'x' }, 'nope', null], files, '')).toEqual([]);
  });

  it('never cites an empty quote', () => {
    expect(gateCitations([{ file: 'src/auth/token.ts', quote: '   ' }], files, '')).toEqual([]);
  });
});

// rankRepoFiles is the free, local retrieval that picks which files to fetch for a question, over
// paths alone (nothing has been fetched yet) — the same keyword-overlap technique as Prism's
// selectPages (tests/prism-ask.test.ts), ranking file tree entries instead of extracted page text.
describe('rankRepoFiles', () => {
  const tree = [
    'src/auth/token.ts',
    'src/api/guard.ts',
    'src/web/fetchWrapper.ts',
    'migrations/2024_add_token_version.sql',
    'README.md',
  ];

  it('ranks paths by keyword overlap with the question', () => {
    const out = rankRepoFiles(tree, 'how does token validation work?');
    expect(out[0]).toBe('src/auth/token.ts');
  });

  it('excludes files already in the in-memory corpus', () => {
    const out = rankRepoFiles(tree, 'token validation', new Set(['src/auth/token.ts']));
    expect(out).not.toContain('src/auth/token.ts');
  });

  it('caps results to the max file count', () => {
    const bigTree = Array.from({ length: 10 }, (_, i) => `src/token/mod${i}.ts`);
    const out = rankRepoFiles(bigTree, 'token', new Set(), 3);
    expect(out).toHaveLength(3);
  });

  it('returns nothing for a question with no meaningful keywords', () => {
    expect(rankRepoFiles(tree, 'huh ok so')).toEqual([]);
  });

  it('returns nothing when no path matches any keyword', () => {
    expect(rankRepoFiles(tree, 'kubernetes ingress controller')).toEqual([]);
  });
});
