import { describe, it, expect, vi } from 'vitest';
// The gateway is a dependency-free ESM module that runs in its own (node) container, but its
// connector core is pure — env and fetch are injected — so we can drive every branch here.
import { runConnector, SUPPORTED_ACTIONS } from '../gateway/connectors.mjs';

/** A fetch stub that records its call and returns a canned response. */
function stubFetch(ok = true, status = ok ? 200 : 502) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return { ok, status } as Response;
  }) satisfies typeof fetch;
  return { impl, calls };
}

describe('actions gateway — connector registry', () => {
  it('exposes the catalog connectors', () => {
    expect(new Set(SUPPORTED_ACTIONS)).toEqual(
      new Set([
        'calendar.addEvent',
        'github.openDraftPr',
        'github.getPrDiff',
        'github.compareRefs',
        'github.getRepoTree',
        'github.getFileContents',
        'github.searchCode',
        'github.getFileCommits',
      ]),
    );
  });

  it('404s an unknown action and never calls out', async () => {
    const { impl } = stubFetch();
    const r = await runConnector('nope.nope', {}, {}, impl);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(impl).not.toHaveBeenCalled();
  });

  it('never throws when the upstream call rejects', async () => {
    const boom = vi.fn(async () => {
      throw new Error('network down');
    });
    const r = await runConnector(
      'calendar.addEvent',
      { title: 'x', start: '2026-07-01T09:00Z' },
      { GOOGLE_OAUTH_TOKEN: 'ya29.test' },
      boom,
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
  });
});

describe('Calendar connector', () => {
  const TOKEN = { GOOGLE_OAUTH_TOKEN: 'ya29.test' };

  it('is unconfigured without a Google token', async () => {
    const { impl } = stubFetch();
    const r = await runConnector(
      'calendar.addEvent',
      { title: 'x', start: '2026-07-01T09:00Z' },
      {},
      impl,
    );
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(r.detail).toContain('Google');
  });

  it('rejects an unparseable start time', async () => {
    const { impl } = stubFetch();
    const r = await runConnector(
      'calendar.addEvent',
      { title: 'x', start: 'whenever' },
      TOKEN,
      impl,
    );
    expect(r.status).toBe(400);
    expect(impl).not.toHaveBeenCalled();
  });

  it('derives the end time from durationMin and authorizes the call', async () => {
    const { impl, calls } = stubFetch();
    const r = await runConnector(
      'calendar.addEvent',
      { title: 'Kickoff', start: '2026-07-01T09:00:00Z', durationMin: '30' },
      TOKEN,
      impl,
    );
    expect(r.ok).toBe(true);
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.summary).toBe('Kickoff');
    expect(sent.start.dateTime).toBe('2026-07-01T09:00:00.000Z');
    expect(sent.end.dateTime).toBe('2026-07-01T09:30:00.000Z'); // +30 min
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
      'Bearer ya29.test',
    );
  });
});

describe('GitHub connector', () => {
  const ENV = {
    GITHUB_OAUTH_TOKEN: 'ghp_test',
    GITHUB_DEFAULT_REPO: 'acme/widget',
  };

  it('is unconfigured without a token', async () => {
    const { impl } = stubFetch();
    const r = await runConnector('github.openDraftPr', { title: 'x', head: 'feat' }, {}, impl);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(r.detail).toContain('GitHub');
    expect(impl).not.toHaveBeenCalled();
  });

  it('is unconfigured when GITHUB_DEFAULT_REPO is missing', async () => {
    const { impl } = stubFetch();
    const r = await runConnector(
      'github.openDraftPr',
      { title: 'x', head: 'feat' },
      { GITHUB_OAUTH_TOKEN: 'ghp_test' },
      impl,
    );
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(impl).not.toHaveBeenCalled();
  });

  it('rejects a PR with no title or branch', async () => {
    const { impl } = stubFetch();
    const r = await runConnector('github.openDraftPr', {}, ENV, impl);
    expect(r.status).toBe(400);
    expect(impl).not.toHaveBeenCalled();
  });

  it('always opens draft:true and posts to the configured repo', async () => {
    const prUrl = 'https://github.com/acme/widget/pull/1';
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const withBody = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 201,
        json: async () => ({ html_url: prUrl }),
      } as unknown as Response;
    }) satisfies typeof fetch;
    const r = await runConnector(
      'github.openDraftPr',
      { title: 'Add feature', head: 'feat/thing', body: 'Details here' },
      ENV,
      withBody,
    );
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('github.com');
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.draft).toBe(true);
    expect(sent.head).toBe('feat/thing');
    expect(sent.base).toBe('main');
    expect(calls[0].url).toContain('acme/widget');
  });
});

describe('GitHub read-only connectors (Ripple)', () => {
  // A richer stub: GitHub returns JSON for metadata and text for the .diff Accept header.
  function ghStub(opts: { diff?: string; meta?: unknown; ok?: boolean; status?: number } = {}) {
    const { diff = 'diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b', ok = true, status = 200 } = opts;
    const meta = opts.meta ?? {
      title: 'Short-lived tokens',
      head: { ref: 'feat/x' },
      base: { ref: 'main' },
    };
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok,
        status,
        json: async () => meta,
        text: async () => diff,
      } as unknown as Response;
    }) satisfies typeof fetch;
    return { impl, calls };
  }
  const env = { GITHUB_OAUTH_TOKEN: 'tok', GITHUB_DEFAULT_REPO: 'acme/widget' };

  it('getPrDiff is unconfigured (and never calls out) without a token', async () => {
    const { impl } = ghStub();
    const r = await runConnector('github.getPrDiff', { prNumber: '42' }, {}, impl);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(impl).not.toHaveBeenCalled();
  });

  it('getPrDiff rejects a non-numeric PR before calling out', async () => {
    const { impl } = ghStub();
    const r = await runConnector('github.getPrDiff', { prNumber: 'main' }, env, impl);
    expect(r.status).toBe(400);
    expect(impl).not.toHaveBeenCalled();
  });

  it('getPrDiff returns the diff payload and ONLY ever issues GET requests (read-only)', async () => {
    const { impl, calls } = ghStub();
    const r = await runConnector('github.getPrDiff', { prNumber: '4821' }, env, impl);
    expect(r.ok).toBe(true);
    expect((r.payload as { diff: string }).diff).toContain('diff --git');
    expect((r.payload as { label: string }).label).toBe('acme/widget #4821');
    // The read-only guarantee: every request this connector makes is a GET. No POST/PUT/PATCH/DELETE.
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.init.method ?? 'GET').toBe('GET');
    expect(calls.every((c) => c.url.includes('/pulls/4821'))).toBe(true);
  });

  it('compareRefs returns the diff between two refs, GET-only', async () => {
    const { impl, calls } = ghStub();
    const r = await runConnector(
      'github.compareRefs',
      { base: 'main', head: 'feat/short-lived-tokens', repo: 'o/r' },
      env,
      impl,
    );
    expect(r.ok).toBe(true);
    expect((r.payload as { diff: string }).diff).toContain('diff --git');
    for (const c of calls) expect(c.init.method ?? 'GET').toBe('GET');
    expect(calls[0]!.url).toContain('/compare/main...feat%2Fshort-lived-tokens');
  });

  it('compareRefs needs both refs', async () => {
    const { impl } = ghStub();
    const r = await runConnector('github.compareRefs', { base: 'main' }, env, impl);
    expect(r.status).toBe(400);
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('GitHub repo-tree connector (Ripple explore — read-only)', () => {
  // A ref (branch/tag) is a moving target, so the connector resolves it to a concrete commit
  // FIRST (`/commits/{ref}`), then reads that commit's own tree SHA — an immutable snapshot.
  // The stub answers each upstream call by URL shape, exactly like the real two-hop sequence.
  function treeStub(
    tree: unknown[],
    truncated = false,
    commitSha = 'c0ffee1234',
    treeSha = 'treeSha5678',
  ) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init: init ?? {} });
      if (u.includes('/commits/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: commitSha, commit: { tree: { sha: treeSha } } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ tree, truncated }),
      } as unknown as Response;
    }) satisfies typeof fetch;
    return { impl, calls };
  }
  const env = { GITHUB_OAUTH_TOKEN: 'tok', GITHUB_DEFAULT_REPO: 'acme/widget' };

  it('resolves the ref to a commit BEFORE fetching its tree, and returns the resolved sha', async () => {
    const { impl, calls } = treeStub(
      [
        { path: 'src/auth/token.ts', type: 'blob' },
        { path: 'src/auth', type: 'tree' }, // a directory entry — excluded
        { path: 'README.md', type: 'blob' },
      ],
      false,
      'c0ffee1234',
      'treeSha5678',
    );
    const r = await runConnector('github.getRepoTree', { ref: 'main' }, env, impl);
    expect(r.ok).toBe(true);
    expect((r.payload as { paths: string[] }).paths).toEqual(['src/auth/token.ts', 'README.md']);
    for (const c of calls) expect(c.init.method ?? 'GET').toBe('GET');
    // Call order: commit resolve first, tree fetch (at the commit's OWN tree sha) second.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain('/commits/main');
    expect(calls[1]!.url).toContain('/git/trees/treeSha5678?recursive=1');
    // The concrete commit sha the ref resolved to — a stable identity to cache against.
    expect((r.payload as { sha: string }).sha).toBe('c0ffee1234');
  });

  it('is unconfigured without a token and never calls out', async () => {
    const { impl } = treeStub([]);
    const r = await runConnector('github.getRepoTree', {}, {}, impl);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(impl).not.toHaveBeenCalled();
  });

  it('surfaces a 404 honestly when the ref itself cannot be resolved to a commit', async () => {
    const impl = vi.fn(async () => ({ ok: false, status: 404 }) as Response) satisfies typeof fetch;
    const r = await runConnector('github.getRepoTree', { ref: 'no-such-branch' }, env, impl);
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(impl).toHaveBeenCalledTimes(1); // never reaches the tree call
  });
});

describe('github.getFileContents (read-only)', () => {
  const env = { GITHUB_OAUTH_TOKEN: 'tok', GITHUB_DEFAULT_REPO: 'acme/widget' };

  it('decodes the file and issues GET only', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => ({ type: 'file', content: Buffer.from('hello code').toString('base64') }),
      } as unknown as Response;
    }) satisfies typeof fetch;
    const r = await runConnector('github.getFileContents', { path: 'src/a.ts' }, env, impl);
    expect(r.ok).toBe(true);
    expect((r.payload as { content: string }).content).toBe('hello code');
    for (const c of calls) expect(c.init.method ?? 'GET').toBe('GET');
  });

  it('rejects a path traversal before calling out', async () => {
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({}),
      }) as unknown as Response) satisfies typeof fetch;
    const spy = vi.fn(impl);
    const r = await runConnector('github.getFileContents', { path: '../../etc/passwd' }, env, spy);
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('github.searchCode (read-only)', () => {
  const env = { GITHUB_OAUTH_TOKEN: 'tok', GITHUB_DEFAULT_REPO: 'acme/widget' };

  it('returns matching file paths and issues GET only', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ path: 'src/x.ts' }, { path: 'src/y.ts' }] }),
      } as unknown as Response;
    }) satisfies typeof fetch;
    const r = await runConnector('github.searchCode', { query: 'validateToken' }, env, impl);
    expect(r.ok).toBe(true);
    expect((r.payload as { files: string[] }).files).toEqual(['src/x.ts', 'src/y.ts']);
    for (const c of calls) expect(c.init.method ?? 'GET').toBe('GET');
    expect(calls[0]!.url).toContain('/search/code?q=');
  });

  it('rejects a non-identifier query before calling out', async () => {
    const spy = vi.fn(
      (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({}),
        }) as unknown as Response) satisfies typeof fetch,
    );
    const r = await runConnector('github.searchCode', { query: 'drop table;' }, env, spy);
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('github.getFileCommits (read-only owners)', () => {
  const env = { GITHUB_OAUTH_TOKEN: 'tok', GITHUB_DEFAULT_REPO: 'acme/widget' };

  it('aggregates recent committers by login and issues GET only', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => [
          { author: { login: 'alice' } },
          { author: { login: 'bob' } },
          { author: { login: 'alice' } },
        ],
      } as unknown as Response;
    }) satisfies typeof fetch;
    const r = await runConnector('github.getFileCommits', { path: 'src/auth/token.ts' }, env, impl);
    expect(r.ok).toBe(true);
    const committers = (r.payload as { committers: { login: string; count: number }[] }).committers;
    expect(committers[0]).toEqual({ login: 'alice', count: 2 }); // most active first
    expect(committers).toContainEqual({ login: 'bob', count: 1 });
    // The read-only guarantee — every request is a GET.
    for (const c of calls) expect(c.init.method ?? 'GET').toBe('GET');
    expect(calls[0]!.url).toContain('/commits?');
  });

  it('rejects a path traversal before calling out', async () => {
    const spy = vi.fn(
      (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as unknown as Response) satisfies typeof fetch,
    );
    const r = await runConnector('github.getFileCommits', { path: '../../etc/passwd' }, env, spy);
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
