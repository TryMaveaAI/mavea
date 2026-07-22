// ripple-owners.test.ts — real, read-only ownership from CODEOWNERS. Guards the parser (comments,
// blanks, last-match-wins) and the glob→path matching (root anchor, directory ownership, basename
// patterns, the `:line` strip) so "who owns this" is grounded in the repo's own contract.
import { describe, it, expect } from 'vitest';
import { parseCodeowners, ownerForPath } from '../src/live/ripple/ingest/owners';

const FILE = `
# Default owner for everything
*            @acme/eng

# The auth area
/src/auth/   @acme/auth-team
src/api/guard.ts  @acme/platform-team @alice

# Docs
*.md         @acme/docs
`;

describe('parseCodeowners', () => {
  it('drops comments + blanks and keeps owner rules in order', () => {
    const rules = parseCodeowners(FILE);
    expect(rules.map((r) => r.glob)).toEqual(['*', '/src/auth/', 'src/api/guard.ts', '*.md']);
    expect(rules[2]!.owners).toEqual(['@acme/platform-team', '@alice']);
  });
});

describe('ownerForPath', () => {
  const rules = parseCodeowners(FILE);

  it('last matching rule wins', () => {
    // a .ts under src/auth matches both `*` and `/src/auth/` → the later one wins
    expect(ownerForPath(rules, 'src/auth/token.ts')).toEqual(['@acme/auth-team']);
  });

  it('a directory rule owns everything beneath it', () => {
    expect(ownerForPath(rules, 'src/auth')).toEqual(['@acme/auth-team']);
    expect(ownerForPath(rules, 'src/auth/refresh/index.ts')).toEqual(['@acme/auth-team']);
  });

  it('an exact-file rule wins for that file (and strips a :line suffix)', () => {
    expect(ownerForPath(rules, 'src/api/guard.ts:21')).toEqual(['@acme/platform-team', '@alice']);
  });

  it('a basename pattern matches anywhere; the catch-all covers the rest', () => {
    expect(ownerForPath(rules, 'docs/guide.md')).toEqual(['@acme/docs']);
    expect(ownerForPath(rules, 'src/server/main.ts')).toEqual(['@acme/eng']);
  });

  it('returns [] when there are no rules', () => {
    expect(ownerForPath([], 'anything')).toEqual([]);
  });
});
