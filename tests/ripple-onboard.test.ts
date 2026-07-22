// ripple-onboard.test.ts — the "understand a repo" model layer. Guards that the parser is defensive
// and that the merge turns a structural floor (file counts) into a real orientation — a project
// summary, per-area purpose/explain/dependencies (matched by verbatim name), a first-week path, and a
// request's life — without ever inventing an area the floor doesn't have.
import { describe, it, expect } from 'vitest';
import { parseOnboarding, mergeOnboarding } from '../src/live/ripple/ingest/onboardSchema';
import { buildShipFromPaths } from '../src/live/ripple/ingest/buildRepo';

const FLOOR = buildShipFromPaths(
  ['src/auth/index.ts', 'src/auth/token.ts', 'src/api/server.ts', 'src/api/routes.ts'],
  'acme/widget',
);

describe('parseOnboarding', () => {
  it('parses a full orientation, tolerating fences', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        summary: 'Widget is a small HTTP service.',
        modules: [
          {
            name: 'src/auth',
            purpose: 'Tokens',
            explain: 'Issues + checks tokens.',
            depends: ['src/api'],
            usedBy: ['src/api'],
          },
        ],
        firstWeek: [
          { title: 'Read the auth flow', why: 'It gates everything', file: 'src/auth/index.ts' },
        ],
        requestLife: ['src/api/server.ts', 'src/auth/token.ts'],
      }) +
      '\n```';
    const o = parseOnboarding(raw);
    expect(o?.summary).toContain('HTTP service');
    expect(o?.modules?.[0]).toMatchObject({ name: 'src/auth', purpose: 'Tokens' });
    expect(o?.firstWeek?.[0]!.title).toBe('Read the auth flow');
    expect(o?.requestLife).toHaveLength(2);
  });

  it('returns null for junk or empty', () => {
    expect(parseOnboarding('no json')).toBeNull();
    expect(parseOnboarding('{}')).toBeNull();
  });
});

describe('mergeOnboarding', () => {
  it('lifts the floor into a real orientation, matching modules by verbatim name', () => {
    const merged = mergeOnboarding(FLOOR, {
      summary: 'Widget is a small HTTP service organised into auth and api.',
      modules: [
        {
          name: 'src/auth',
          purpose: 'Tokens & sessions',
          explain: 'Issues and verifies tokens.',
          depends: [],
          usedBy: ['src/api'],
        },
      ],
      firstWeek: [
        { title: 'Trace a login', why: 'See auth end to end', file: 'src/auth/index.ts' },
      ],
      requestLife: ['server.ts', 'routes.ts', 'token.ts'],
    });

    expect(merged.pr.summary).toContain('HTTP service');
    const auth = merged.modules.find((m) => m.name === 'src/auth')!;
    expect(auth.purpose).toBe('Tokens & sessions');
    expect(auth.explain).toContain('verifies tokens');
    expect(auth.usedBy).toEqual(['src/api']);
    // A module the model didn't mention keeps its floor purpose.
    const api = merged.modules.find((m) => m.name === 'src/api')!;
    expect(api.purpose).toBe(FLOOR.modules.find((m) => m.name === 'src/api')!.purpose);
    // The first-week path + request life come through.
    expect(merged.onboarding?.firstWeek[0]!.title).toBe('Trace a login');
    expect(merged.onboarding?.requestLife).toEqual(['server.ts', 'routes.ts', 'token.ts']);
  });

  it('keeps the floor when the model gives nothing', () => {
    const merged = mergeOnboarding(FLOOR, {});
    expect(merged.pr.summary).toBe(FLOOR.pr.summary);
    expect(merged.modules).toEqual(FLOOR.modules);
  });
});
