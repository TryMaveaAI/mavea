// ripple-github-browser.test.ts — the browser-direct GitHub reader that lets Ripple's "From GitHub"
// intake read a PR / compare / repo straight from api.github.com, with NO local gateway. Public repos
// read keyless; a private repo reads with the user's stored token as a Bearer credential. These tests
// mock `fetch` (and the token store) to pin: a keyless public PR parses, a stored token is sent,
// honest error mapping for 404 (private) / 403 rate-limit / 401 (bad token), and a compare range.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the token store so the auth path is deterministic without Web Crypto / IndexedDB.
vi.mock('../src/live/ripple/ingest/githubToken', () => ({
  getGithubToken: vi.fn(async () => ''),
}));

import { getGithubToken } from '../src/live/ripple/ingest/githubToken';
import { fetchPrDiff, compareRefs, fetchRepoTree } from '../src/live/ripple/ingest/githubBrowser';

const mockedToken = vi.mocked(getGithubToken);

interface FakeRes {
  status?: number;
  text?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

/** A minimal Response stand-in with just what the reader touches (ok/status/text/json/headers.get). */
function ghRes(init: FakeRes = {}): Response {
  const { status = 200, text = '', json, headers = {} } = init;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (json !== undefined ? json : JSON.parse(text || '{}')),
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

function headersOf(call: [string, RequestInit] | undefined): Record<string, string> {
  return (call?.[1]?.headers ?? {}) as Record<string, string>;
}
function acceptOf(init?: RequestInit): string {
  return ((init?.headers ?? {}) as Record<string, string>).accept ?? '';
}
function stubFetch(fn: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(fn);
  vi.stubGlobal('fetch', mock as unknown as typeof fetch);
  return mock;
}

const PR_DIFF =
  'diff --git a/src/auth/token.ts b/src/auth/token.ts\n@@ -42 +42 @@\n-validateToken(t: string)\n+validateToken(t: string, opts: VerifyOpts)\n';

beforeEach(() => {
  mockedToken.mockReset();
  mockedToken.mockResolvedValue('');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPrDiff (browser-direct)', () => {
  it('reads a PUBLIC PR with no token — success, parsed diff + title + label, no Authorization', async () => {
    const fetchMock = stubFetch(async (_url, init) =>
      acceptOf(init).includes('diff')
        ? ghRes({ text: PR_DIFF })
        : ghRes({ json: { title: 'Short-lived tokens' } }),
    );

    const r = await fetchPrDiff('482', 'acme/widget');

    expect(r.ok).toBe(true);
    expect(r.diff).toBe(PR_DIFF);
    expect(r.title).toBe('Short-lived tokens');
    expect(r.label).toBe('acme/widget #482');
    // Two GETs (PR JSON, then the raw diff), both against the same PR URL, and NO Authorization.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain(
      'https://api.github.com/repos/acme/widget/pulls/482',
    );
    expect(
      headersOf(fetchMock.mock.calls[0] as [string, RequestInit]).authorization,
    ).toBeUndefined();
  });

  it('sends a stored token as `Authorization: Bearer <token>`', async () => {
    mockedToken.mockResolvedValue('ghp_secret123');
    const fetchMock = stubFetch(async (_url, init) =>
      acceptOf(init).includes('diff') ? ghRes({ text: PR_DIFF }) : ghRes({ json: { title: 'x' } }),
    );

    const r = await fetchPrDiff('482', 'acme/widget');

    expect(r.ok).toBe(true);
    expect(headersOf(fetchMock.mock.calls[0] as [string, RequestInit]).authorization).toBe(
      'Bearer ghp_secret123',
    );
    expect(headersOf(fetchMock.mock.calls[1] as [string, RequestInit]).authorization).toBe(
      'Bearer ghp_secret123',
    );
  });

  it('maps a 404 with NO token to an "add a token" hint, never a raw status', async () => {
    stubFetch(async () => ghRes({ status: 404, text: 'Not Found' }));

    const r = await fetchPrDiff('999', 'secret/repo');

    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/private/i);
    expect(r.detail).toMatch(/add a github token/i);
    expect(r.detail).not.toMatch(/\b404\b/);
  });

  it('maps a 404 WITH a stored token to a repo-access hint, not "add a token"', async () => {
    // A fine-grained token that wasn't granted THIS repo 404s exactly like a typo — so once a token
    // is stored, point at the token's repo access instead of telling the reader to add one they have.
    mockedToken.mockResolvedValue('github_pat_scoped_elsewhere');
    stubFetch(async () => ghRes({ status: 404, text: 'Not Found' }));

    const r = await fetchRepoTree('HEAD', 'secret/other-repo');

    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/access/i);
    expect(r.detail).toMatch(/private/i);
    expect(r.detail).not.toMatch(/add a github token/i);
    expect(r.detail).not.toMatch(/\b404\b/);
  });

  it('maps a rate-limited 403 (x-ratelimit-remaining: 0) to a helpful message', async () => {
    stubFetch(async () => ghRes({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }));

    const r = await fetchPrDiff('1', 'acme/widget');

    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/rate-limit/i);
    expect(r.detail).toMatch(/token/i);
  });

  it('maps 401 to a bad-token message', async () => {
    mockedToken.mockResolvedValue('ghp_bad');
    stubFetch(async () => ghRes({ status: 401 }));

    const r = await fetchPrDiff('1', 'acme/widget');

    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/rejected/i);
  });

  it('fails helpfully when no repo is given (no server-side default in the browser)', async () => {
    const fetchMock = stubFetch(async () => ghRes({ text: PR_DIFF }));

    const r = await fetchPrDiff('1');

    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/owner\/name|GitHub link/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('compareRefs (browser-direct)', () => {
  it('reads the diff for a base...head range', async () => {
    const fetchMock = stubFetch(async () => ghRes({ text: PR_DIFF }));

    const r = await compareRefs('main', 'feature', 'acme/widget');

    expect(r.ok).toBe(true);
    expect(r.diff).toBe(PR_DIFF);
    expect(r.label).toBe('acme/widget main...feature');
    expect(fetchMock.mock.calls[0]![0]).toContain(
      'https://api.github.com/repos/acme/widget/compare/main...feature',
    );
    expect(acceptOf(fetchMock.mock.calls[0]![1] as RequestInit)).toContain('diff');
  });
});

describe('fetchRepoTree (browser-direct)', () => {
  it('resolves the ref to a concrete commit sha, then lists blob paths', async () => {
    const fetchMock = stubFetch(async (url) => {
      if (url.includes('/commits/')) {
        return ghRes({ json: { sha: 'c0ffee1234', commit: { tree: { sha: 'tree99' } } } });
      }
      return ghRes({
        json: {
          truncated: false,
          tree: [
            { type: 'blob', path: 'src/index.ts' },
            { type: 'tree', path: 'src' },
            { type: 'blob', path: 'README.md' },
          ],
        },
      });
    });

    const r = await fetchRepoTree('main', 'acme/widget');

    expect(r.ok).toBe(true);
    expect(r.sha).toBe('c0ffee1234');
    expect(r.paths).toEqual(['src/index.ts', 'README.md']); // blobs only, tree entries dropped
    expect(r.label).toBe('acme/widget');
    // The tree fetch uses the commit's tree sha, recursively.
    expect(fetchMock.mock.calls[1]![0]).toContain('/git/trees/tree99');
  });
});
