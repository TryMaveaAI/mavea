// ripple-io-and-layout.test.ts — the edges Ripple's rendered-overlay suite can't hold: the REAL
// browser-direct GitHub reader and the REAL enrichment path (both are mocked away file-wide in
// tests/ripple-overlay.test.tsx, so they have to live here), plus the CSS source-scans that guard
// Ripple's and Dashboards' responsive layout — jsdom has no layout engine, so those are scanned, not
// rendered.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ModelConfig } from '../src/types/mavea';

// Mock the token store so the auth path is deterministic without Web Crypto / IndexedDB.
vi.mock('../src/live/ripple/ingest/githubToken', () => ({
  getGithubToken: vi.fn(async () => ''),
}));

const fake = {
  raw: 'not json at all',
  shouldThrow: false,
  throwName: 'Error',
  /** Chunks the stubbed adapter hands to `onDelta` before resolving — how a reply is chopped up. */
  deltas: [] as string[],
};

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    id: 'anthropic',
    capabilities: {
      constrainedDecoding: false,
      streaming: false,
      vision: false,
      contextWindow: 8192,
      strengthTier: 'mid' as const,
      nativeWebSearch: false,
    },
    probe: async () => ({ ok: true, model: true }),
    generate: async (
      _req: unknown,
      _cfg: unknown,
      onDelta?: (chunk: string, meta?: { reasoning?: boolean }) => void,
    ) => {
      if (fake.shouldThrow) {
        if (fake.throwName === 'AbortError') throw new DOMException('aborted', 'AbortError');
        throw new Error('no credentials configured');
      }
      for (const chunk of fake.deltas) onDelta?.(chunk);
      return { raw: fake.raw };
    },
  }),
}));

// Import AFTER the mocks are registered (vi.mock is hoisted, so this is safe).
import { getGithubToken } from '../src/live/ripple/ingest/githubToken';
import { fetchPrDiff, compareRefs, fetchRepoTree } from '../src/live/ripple/ingest/githubBrowser';
import { enrichShipModel } from '../src/live/ripple/ingest/generate';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';
import { fileUrl } from '../src/live/ripple/links';

// The browser-direct GitHub reader that lets Ripple's "From GitHub"
// intake read a PR / compare / repo straight from api.github.com, with NO local gateway. Public repos
// read keyless; a private repo reads with the user's stored token as a Bearer credential. These tests
// mock `fetch` (and the token store) to pin: a keyless public PR parses, a stored token is sent,
// honest error mapping for 404 (private) / 403 rate-limit / 401 (bad token), and a compare range.
describe('ripple GitHub reader (browser-direct)', () => {
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
        acceptOf(init).includes('diff')
          ? ghRes({ text: PR_DIFF })
          : ghRes({ json: { title: 'x' } }),
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
});

// enrichShipModel must resolve `null` on a GENUINE failure (no
// key, a refusal, malformed JSON) so the overlay can say so honestly, but resolve the unchanged
// floor when the call was merely superseded (an in-flight run cancelled by a newer one) — that's
// not a failure worth reporting. Exercises the real function against a stubbed provider adapter;
// only the network boundary is faked — including the delta stream, which is where the incremental
// read of the reply is pinned.
describe('enrichShipModel — honest failure, superseded, and the streamed read', () => {
  const FLOOR = buildShipFromDiff(
    parseUnifiedDiff(`diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -42 +42 @@
-validateToken(t: string)
+validateToken(t: string, opts: VerifyOpts)
`),
  );

  const CFG: ModelConfig = { provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' };

  beforeEach(() => {
    fake.raw = 'not json at all';
    fake.shouldThrow = false;
    fake.throwName = 'Error';
    fake.deltas = [];
  });

  it('resolves null when the model replies with an unparseable read', async () => {
    fake.raw = 'not json at all';
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).toBeNull();
  });

  it('resolves null when the provider call throws (no key, a refusal, a network error)', async () => {
    fake.shouldThrow = true;
    fake.throwName = 'Error';
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).toBeNull();
  });

  it('resolves the unchanged floor — not null — when the call is aborted (superseded, not a failure)', async () => {
    fake.shouldThrow = true;
    fake.throwName = 'AbortError';
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).toBe(FLOOR);
  });

  it('still resolves a real merged model on a genuinely successful read', async () => {
    fake.raw = JSON.stringify({ summary: 'Threads a VerifyOpts through token validation.' });
    const result = await enrichShipModel(FLOOR, 'diff text', CFG);
    expect(result).not.toBeNull();
    expect(result?.pr.summary).toBe('Threads a VerifyOpts through token validation.');
  });

  // The overlay sharpens as the reply streams, and the call must hold ONE cursor-holding reader for
  // the whole reply. It once built a fresh one per delta — invisible in the output, and O(chunks ×
  // buffer) in cost, since every already-closed element was re-parsed on every chunk. The property
  // that catches a relapse: chopping the SAME reply finer changes neither the partials nor the work.
  it('reads the stream incrementally — chopping the reply finer costs no extra parses', async () => {
    const reply = JSON.stringify({
      summary: 'Threads a VerifyOpts through token validation.',
      risks: [
        { level: 'breaks', text: 'guard.ts still calls the old shape' },
        { level: 'watch', text: 'rotation is not atomic' },
      ],
      changes: [{ id: 'c0', intent: 'adds opts to validateToken', why: 'short-lived tokens' }],
      gateRationale: 'Hold until guard.ts is updated.',
    });

    /** Run one enrichment over a given chopping of the reply; report the partials and the parse work. */
    async function run(deltas: string[]): Promise<{ parses: number; partials: unknown[] }> {
      fake.raw = reply;
      fake.deltas = deltas;
      const partials: unknown[] = [];
      const parse = vi.spyOn(JSON, 'parse');
      try {
        await enrichShipModel(FLOOR, 'diff text', CFG, { onPartial: (e) => partials.push(e) });
        return { parses: parse.mock.calls.length, partials };
      } finally {
        parse.mockRestore();
      }
    }

    const whole = await run([reply]);
    const fine = await run([...reply]); // the same reply, one character at a time

    expect(fine.parses).toBe(whole.parses);
    expect(fine.partials.at(-1)).toEqual(whole.partials.at(-1));
    expect(fine.partials.length).toBeGreaterThan(1); // it really did sharpen along the way
  });
});

// Guards against the responsive regressions found in a launch-readiness pass: Ripple's top bar and
// Dashboards' sticky nav clipped/overlapped their own content below ~430px (a flex item with
// white-space: nowrap can't shrink without min-width: 0, so ellipsis never kicks in and the row just
// overflows), and Ripple's rail+main stayed side-by-side at phone widths, squeezing the main pane to
// an unusable sliver. jsdom has no real layout engine, so this can't be caught by rendering — it's a
// source-scan for the exact CSS shape that fixed it, the same idiom as
// tests/canvas-svg-label-patterns.test.ts.
describe('Ripple overlay — the top bar reflows instead of clipping', () => {
  /** The declaration block for the first `selector { ... }` rule found (not nested at-rules). */
  function ruleBody(css: string, selector: string): string {
    const escaped = selector.replace(/[.[\]]/g, (c) => '\\' + c);
    const m = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!m) throw new Error(`selector not found in stylesheet: ${selector}`);
    return m[1]!;
  }

  const css = readFileSync(join(__dirname, '../src/live/ripple/ripple.css'), 'utf8');

  it('.ripple-head wraps its two clusters onto separate rows when they do not fit', () => {
    expect(ruleBody(css, '.ripple-head')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('.ripple-head-right (stats + P0 badge + icon buttons) can also wrap internally', () => {
    expect(ruleBody(css, '.ripple-head-right')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the nowrap monospace identity fields declare min-width: 0 so their ellipsis can engage', () => {
    // .ripple-repo, .ripple-pr, .ripple-branch, .ripple-stat share one rule body.
    const body = ruleBody(css, '.ripple-repo,\n.ripple-pr,\n.ripple-branch,\n.ripple-stat');
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  it('below tablet width the rail stacks above the main pane instead of squeezing it', () => {
    const mobile = /@media \(max-width: 720px\) \{([\s\S]*?)\n\}\n\n/.exec(css)?.[1];
    expect(mobile, 'expected a max-width: 720px block after the rail/main rules').toBeTruthy();
    expect(mobile).toMatch(/\.ripple-body\s*\{[^}]*flex-direction:\s*column/);
    expect(mobile).toMatch(/\.ripple-rail\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('the scrim uses the shared scrim token, not a raw color, behind its blur', () => {
    expect(ruleBody(css, '.ripple-scrim')).toMatch(/var\(--scrim-rgb\)/);
  });
});

describe('Dashboards — the sticky top bar and tile grid reflow instead of clipping', () => {
  /** The declaration block for the first `selector { ... }` rule found (not nested at-rules). */
  function ruleBody(css: string, selector: string): string {
    const escaped = selector.replace(/[.[\]]/g, (c) => '\\' + c);
    const m = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!m) throw new Error(`selector not found in stylesheet: ${selector}`);
    return m[1]!;
  }

  // The topbar + home tile grid live in dash-home.css (DashTopBar/DashboardHome); detail/settings/
  // overview chrome — .dash-detail-title included — stayed behind in dashboards.css.
  const homeCss = readFileSync(join(__dirname, '../src/live/dashboards/dash-home.css'), 'utf8');
  const css = readFileSync(join(__dirname, '../src/live/dashboards/dashboards.css'), 'utf8');

  it('.dash-topbar-scroll scrolls horizontally rather than forcing the sticky bar to overflow', () => {
    const body = ruleBody(homeCss, '.dash-topbar-scroll');
    expect(body).toMatch(/min-width:\s*0/);
    expect(body).toMatch(/overflow-x:\s*auto/);
  });

  it('.dash-topbar-brand and .dash-topbar-link never shrink below their own content (the scroll row does)', () => {
    expect(ruleBody(homeCss, '.dash-topbar-brand')).toMatch(/flex:\s*none/);
    expect(ruleBody(homeCss, '.dash-topbar-link')).toMatch(/flex:\s*none/);
  });

  it('the tracking grid can shrink its column below 300px on a phone narrower than that', () => {
    expect(homeCss).toMatch(/\.dash-track-grid\s*\{[^}]*minmax\(min\(\d+px, 100%\), 1fr\)/);
  });

  it('the empty dashboard hero overrides centered auto margins and fills the compact main column', () => {
    const body = ruleBody(homeCss, '.dash-home-main > .dash-empty--hero');
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/margin:\s*0/);
    expect(body).toMatch(/max-width:\s*none/);
  });

  it('a long dashboard title ellipsizes instead of forcing the detail header to overflow', () => {
    const body = ruleBody(css, '.dash-detail-title');
    // A flex item defaults to min-width: auto (its full text width) — it must be capped below
    // that (a small floor is fine, unlike the old bare `flex: none`) for the ellipsis to engage.
    expect(body).toMatch(/min-width:\s*\d/);
    expect(body).toMatch(/text-overflow:\s*ellipsis/);
  });
});

// Guards the scrollbar-gutter/oscillation fix (a ResizeObserver-driven
// fit-to-container inside .ripple-main/.ripple-rail needs a reserved scrollbar lane or it
// oscillates as the scrollbar pops in/out — the same class of bug fixed for the PDF panel in
// pdfworld.css) and the vh-floor regression that defeated it inside shorter panels (the verdict
// band's embedded impact map). Also guards that the P0-era section-stub placeholder it shipped
// alongside is fully retired. Source-scans only, mirroring the responsive scans above
// and tests/prism-app-scroll.test.ts — jsdom has no real layout engine, so scrollbar/overflow
// geometry can't be asserted by rendering.
describe('ripple.css — the ResizeObserver fit + the retired section stub', () => {
  /** The declaration block for the first `selector { ... }` rule found (not nested at-rules). */
  function ruleBody(css: string, selector: string): string {
    const escaped = selector.replace(/[.[\]]/g, (c) => '\\' + c);
    const m = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!m) throw new Error(`selector not found in stylesheet: ${selector}`);
    return m[1]!;
  }

  const RIPPLE_DIR = join(__dirname, '../src/live/ripple');
  const css = readFileSync(join(RIPPLE_DIR, 'ripple.css'), 'utf8');

  describe('ripple.css — scrollbar-gutter reserved where a ResizeObserver fits to the container', () => {
    it('.ripple-main reserves a stable scrollbar gutter', () => {
      expect(ruleBody(css, '.ripple-main')).toMatch(/scrollbar-gutter:\s*stable/);
    });

    it('.ripple-rail reserves a stable scrollbar gutter', () => {
      expect(ruleBody(css, '.ripple-rail')).toMatch(/scrollbar-gutter:\s*stable/);
    });
  });

  // The map's floor is stated in pixels because the panel it sits in scrolls: a floor written as a
  // fraction of the VIEWPORT is unrelated to the space the panel actually has. It may be capped by
  // the viewport so a short window scrolls instead of reserving a stage taller than itself — what
  // it may never be is a bare viewport fraction.
  describe('ripple.css — the impact map panels state their floor in pixels', () => {
    it.each([['.ripple-impact'], ['.ripple-stage']])('%s names a pixel floor', (selector) => {
      const body = ruleBody(css, selector);
      const floor = /min-height:([^;]+);/.exec(body)?.[1] ?? '';
      expect(floor).toMatch(/\d+px/);
      expect(floor).not.toMatch(/^\s*\d+(?:d|s|l)?vh\s*$/);
    });
  });

  describe('the P0-era section stub is fully retired', () => {
    it('SectionStub.tsx no longer exists', () => {
      expect(existsSync(join(RIPPLE_DIR, 'sections/SectionStub.tsx'))).toBe(false);
    });

    it('no source file under src/live/ripple references SectionStub or the stale "coming alive" copy', () => {
      const offenders: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(tsx?|css)$/.test(entry.name)) {
            const text = readFileSync(full, 'utf8');
            if (/SectionStub|Coming alive|in the next pass|in a later pass/.test(text)) {
              offenders.push(full);
            }
          }
        }
      };
      walk(RIPPLE_DIR);
      expect(offenders).toEqual([]);
    });
  });
});

describe('fileUrl — a ref is validated like the repo beside it', () => {
  it('links a real repo at a branch, tag or SHA, and strips a ":focus" suffix', () => {
    expect(fileUrl('acme/widgets', 'feat/short-lived-tokens', 'src/auth/token.ts:validate')).toBe(
      'https://github.com/acme/widgets/blob/feat/short-lived-tokens/src/auth/token.ts',
    );
    expect(fileUrl('acme/widgets', '', 'README.md')).toBe(
      'https://github.com/acme/widgets/blob/HEAD/README.md',
    );
  });

  it('refuses a ref that is not a ref name', () => {
    expect(fileUrl('acme/widgets', '../../evil', 'a.ts')).toBeNull();
    expect(fileUrl('acme/widgets', 'main?x=1', 'a.ts')).toBeNull();
    expect(fileUrl('acme/widgets', 'main#frag', 'a.ts')).toBeNull();
    expect(fileUrl('acme/widgets', 'main whatever', 'a.ts')).toBeNull();
  });
});
