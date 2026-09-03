// ripple-overlay.test.tsx — the rendered Ripple surfaces: the standalone #/ripple app, the overlay's
// GitHub-first intake and two-job rail, the Ask rail (its pure retrieval/grounding helpers, its hook,
// and the two prefilled entry points), the grounded migration explanation, and the floor-first
// perceived-speed guarantee. Every module mock in this file is compatible with every other one here:
// `githubBrowser` and `generate` are faked file-wide for the floor-first path, so the tests that
// exercise the REAL reader / enrichment live in tests/ripple-io-and-layout.test.ts instead.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';

const { speakSpy } = vi.hoisted(() => ({ speakSpy: vi.fn() }));
vi.mock('../src/voice/tts', () => ({ speak: speakSpy }));

type AskRepoFn = typeof import('../src/live/ripple/ask/repoAsk').askRepo;
// A factory-hoisted vi.fn, dereferenced lazily inside the mock below — a direct top-level reference
// from the mock factory would hit vi.mock's hoisting TDZ (see the floor-first block below).
const askRepoImpl = vi.fn<AskRepoFn>();
vi.mock('../src/live/ripple/ask/repoAsk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/ripple/ask/repoAsk')>();
  return {
    ...actual,
    askRepo: (...args: Parameters<AskRepoFn>) => askRepoImpl(...args),
  };
});

// Shared across the mock factory and the tests — hoisted so `vi.mock`'s factory (which runs before the
// module body) can reference it without a TDZ error.
const fixtures = vi.hoisted(() => ({
  DIFF: `diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -42 +42 @@
-validateToken(t: string)
+validateToken(t: string, opts: VerifyOpts)
`,
  PR_LABEL: 'acme/widget #482',
}));

// The browser-direct GitHub reader, mocked: `fetchPrDiff` returns the diff so Analyze builds the floor
// from it, and every deeper read (files / callers / owners) returns a benign empty result so
// analyzeDiff's grounding never touches the network. The floor still comes entirely from the diff.
vi.mock('../src/live/ripple/ingest/githubBrowser', () => ({
  fetchPrDiff: () =>
    Promise.resolve({
      ok: true,
      detail: 'Loaded PR #482',
      diff: fixtures.DIFF,
      label: fixtures.PR_LABEL,
      title: 'Short-lived tokens',
    }),
  compareRefs: () => Promise.resolve({ ok: false, detail: '' }),
  fetchRepoTree: () => Promise.resolve({ ok: false, detail: '' }),
  fetchFileContents: () => Promise.resolve({ ok: false }),
  searchCallers: () => Promise.resolve({ ok: false, files: [] }),
  fetchCodeowners: () => Promise.resolve(''),
  fetchFileCommits: () => Promise.resolve([]),
}));

// A type-only reference to the real signature (no `import` statement naming the mocked module,
// which would confuse Vitest's mock-hoisting scan for that specifier).
type EnrichShipModelFn = typeof import('../src/live/ripple/ingest/generate').enrichShipModel;

// Stub the model calls so the test never touches the network and the verdict can be asserted while
// enrichment is still "in flight". Individual tests below override `enrichShipModel` per case. The
// factory below wraps the call in its own arrow (rather than handing `enrichShipModel` straight to
// the returned object) so it's dereferenced lazily, at call time — vi.mock's factory can run before
// this `const` initializes, and a direct reference there would be a TDZ error.
const enrichShipModel = vi.fn<EnrichShipModelFn>(() => new Promise(() => {})); // default: never resolves
vi.mock('../src/live/ripple/ingest/generate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/ripple/ingest/generate')>();
  return {
    ...actual,
    enrichShipModel: (...args: Parameters<EnrichShipModelFn>) => enrichShipModel(...args),
    enrichOrientation: () => new Promise(() => {}),
    enrichCourses: () => new Promise(() => {}),
    enrichIncident: () => new Promise(() => {}),
  };
});

import { RippleApp } from '../src/live/ripple/RippleApp';
import { SEED_SHIP } from '../src/live/ripple/seed';
import { RippleOverlay } from '../src/live/ripple/RippleOverlay';
import { LessonBody } from '../src/live/ripple/sections/LessonBody';
import { ShipMigration } from '../src/live/ripple/sections/ShipMigration';
import { gateCitations, rankRepoFiles } from '../src/live/ripple/ask/repoAsk';
import { useRippleAsk } from '../src/live/ripple/ask/useRippleAsk';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import type { RepoAskContext } from '../src/live/ripple/ask/repoAsk';
import type { RepoAskAnswer } from '../src/live/ripple/ask/types';
import type { CourseLesson, ShipCourse, ShipModel } from '../src/live/ripple/model';

// The #/ripple standalone surface (RippleApp) must wire real speech
// into the overlay so the narration toggle (rendered only when a `speak` prop exists) actually
// appears and, once opted in, actually talks — Ripple stays silent-by-default (narration starts
// off), but the affordance must not be a dead end once someone turns it on.
describe('RippleApp', () => {
  // Each test renders a fresh RippleApp; clear the "seen the worked example" flag so every test
  // sees the same plain worked-example landing rather than the GitHub intake re-opening on top.
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    speakSpy.mockClear();
  });

  it('passes a working speak prop down, so the narration toggle appears (default off)', async () => {
    render(<RippleApp />);
    // The toggle only renders at all when `speak` is present — its very presence is the guard.
    const toggle = await screen.findByRole('button', { name: /Turn narration on/i });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('speaks through the shared Kokoro voice as "mavea" once narration is switched on', async () => {
    render(<RippleApp />);
    fireEvent.click(await screen.findByRole('button', { name: /Turn narration on/i }));
    // Any rail item's onClick narrates its section when narration is on.
    fireEvent.click(screen.getByRole('button', { name: /Mavéa.s read/i }));
    await waitFor(() => expect(speakSpy).toHaveBeenCalled());
    const [text, who] = speakSpy.mock.calls[0]!;
    expect(typeof text).toBe('string');
    expect(who).toBe('mavea');
  });
});

// The GitHub-first front door. The intake opens on the GitHub tab with the
// single smart input, and the launch behaviour is honest: the FIRST open shows the rich worked example
// plainly; EVERY open after opens the GitHub intake on top of it (the example stays one click away).
describe('GitHub-first intake', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('opens the intake on the GitHub smart input (not paste)', () => {
    const { getByText, getByPlaceholderText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );
    // Open the intake from the worked-example CTA.
    fireEvent.click(getByText(/Run on your own code/i));
    // The GitHub smart input is the default surface.
    expect(getByPlaceholderText(/github\.com\/owner\/repo\/pull/i)).toBeTruthy();
  });

  it('first launch shows the worked example plainly; the next launch opens GitHub on top', () => {
    // First time: no auto intake — the rich example is the front page.
    const first = render(<RippleOverlay model={SEED_SHIP} onClose={() => undefined} />);
    expect(first.queryByPlaceholderText(/github\.com\/owner\/repo\/pull/i)).toBeNull();
    cleanup();

    // Returning: GitHub is the front door, opened over the (still reachable) worked example.
    const second = render(<RippleOverlay model={SEED_SHIP} onClose={() => undefined} />);
    expect(second.getByPlaceholderText(/github\.com\/owner\/repo\/pull/i)).toBeTruthy();
  });

  it('an invalid smart input shows an honest reason, never crashes', () => {
    const { getByText, getByPlaceholderText, getByRole } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );
    fireEvent.click(getByText(/Run on your own code/i));
    fireEvent.change(getByPlaceholderText(/github\.com\/owner\/repo\/pull/i), {
      target: { value: 'not a github link' },
    });
    fireEvent.click(getByRole('button', { name: /^Analyze$/i }));
    expect(getByText(/Paste a GitHub PR, compare, or repo URL/i)).toBeTruthy();
  });
});

// Ripple's two-job spine + courses made first-class. The rail groups sections
// into "Understand" and "Ship the change", and Courses is now its OWN top-level entry (no longer buried
// under a generic "Onboarding"), so a reader can SEE the curriculum and open it directly.
describe('two-job rail + first-class courses', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    try {
      localStorage.clear(); // first-run: the worked example opens plainly (no auto intake)
    } catch {
      /* ignore */
    }
  });

  it('labels both job clusters for a change that also has a curriculum', () => {
    const { getByText } = render(<RippleOverlay model={SEED_SHIP} onClose={() => undefined} />);
    expect(getByText('Ship the change')).toBeTruthy();
    expect(getByText('Understand')).toBeTruthy();
  });

  it('shows a dedicated "Courses" entry and opens the curriculum directly', async () => {
    const { getAllByRole, getByText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );
    const courses = getAllByRole('button', { name: /^Courses$/i });
    expect(courses.length).toBeGreaterThan(0);
    fireEvent.click(courses[0]!);
    // The curriculum surface (not a buried sub-tab).
    await waitFor(() => expect(getByText(/Guided curriculum/i)).toBeTruthy());
  });
});

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

// useRippleAsk drives the repo ask thread — a straight port of Prism's useAsk (see ask/useAsk.ts's
// own doc comment). These pin the two properties that matter for a chat-style thread: only one
// question is ever in flight (a second ask while pending is ignored, not queued), and an in-flight
// request is aborted the instant the hook unmounts rather than resolving into a gone component.
describe('useRippleAsk', () => {
  const baseModel: ShipModel = {
    pr: { repo: 'acme/widget', title: 'widget', summary: 'A widget repo.', risks: [] },
    nodes: [],
    edges: [],
    changes: [],
    cascades: [],
    rollout: [],
    workTypes: [],
    hotspots: [],
    suggestions: [],
    suppressedNits: 0,
    modules: [],
    gate: {
      decision: 'watch',
      shipSafe: false,
      unackedP0: 0,
      requires: [],
      deployOrder: 'unset',
      conditions: [],
      rationale: 'Exploring — nothing to gate.',
    },
    provenance: { source: 'github' },
  };

  const ctx: RepoAskContext = {
    model: baseModel,
    cfg: { provider: 'anthropic', model: 'test' },
    altitude: 'working',
    fileCache: new Map(),
  };

  const ANSWER: RepoAskAnswer = {
    text: 'It reshapes validateToken.',
    coverage: 'full',
    citations: [],
  };

  afterEach(() => {
    askRepoImpl.mockReset();
    vi.restoreAllMocks();
  });

  it('ignores a second ask while one is still pending', async () => {
    let resolveFirst!: (a: RepoAskAnswer) => void;
    askRepoImpl.mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)));
    const { result } = renderHook(() => useRippleAsk(ctx));

    act(() => result.current.ask('what does this repo do?'));
    act(() => result.current.ask('a second question while the first is in flight'));

    expect(askRepoImpl).toHaveBeenCalledTimes(1); // the second call was ignored, not queued
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolveFirst(ANSWER);
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.turns[0]?.answer).toEqual(ANSWER);

    // Once settled, a NEW question is accepted normally.
    askRepoImpl.mockResolvedValueOnce({ ...ANSWER, text: 'a second, real answer' });
    await act(async () => {
      result.current.ask('now a real second question');
      await Promise.resolve();
    });
    expect(askRepoImpl).toHaveBeenCalledTimes(2);
    expect(result.current.turns).toHaveLength(2);
  });

  it('aborts the in-flight request on unmount instead of leaking it into a gone component', () => {
    let seenSignal: AbortSignal | undefined;
    askRepoImpl.mockImplementationOnce((_q, c) => {
      seenSignal = c.signal;
      return new Promise(() => {}); // never resolves — only unmount can end it
    });
    const { result, unmount } = renderHook(() => useRippleAsk(ctx));
    act(() => result.current.ask('a question that never gets a reply'));

    expect(seenSignal?.aborted).toBe(false);
    unmount();
    expect(seenSignal?.aborted).toBe(true);
  });

  it('does nothing for a blank question or a null context', () => {
    const { result } = renderHook(() => useRippleAsk(null));
    act(() => result.current.ask('   '));
    expect(askRepoImpl).not.toHaveBeenCalled();
    expect(result.current.turns).toHaveLength(0);
  });

  // A request that never landed is not a verdict about the repo. Resolving the failure as an answer
  // put "not covered by what Ripple has read" — the same pill real grounding uses — over a
  // transport error, and left the thread's own error state unreachable.
  it('reports a failed request as an error turn, never as a coverage verdict', async () => {
    askRepoImpl.mockRejectedValueOnce(new Error('Couldn’t reach the model just now.'));
    const { result } = renderHook(() => useRippleAsk(ctx));

    await act(async () => {
      result.current.ask('what is the blast radius?');
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe('error'));
    expect(result.current.turns[0]?.answer).toBeUndefined();
    expect(result.current.turns[0]?.error).toMatch(/reach the model/i);
    expect(result.current.busy).toBe(false);
  });
});

// The Ask rail's two "opens me, prefilled" entry points: a node's "Ask about {label}" (RippleOverlay
// wires onAsk → openAsk) and a lesson's "Ask about this lesson" chip (LessonBody → onAskAboutLesson).
// Both must work with ZERO voice configured — narration is additive on top, never required to open
// the rail or ask a real question about the repo.
describe('Ripple — a node’s Ask opens the rail, voiceless', () => {
  afterEach(cleanup);

  const cfg = { provider: 'anthropic' as const, model: 'test', apiKey: 'x' };

  it('prefills a real question with no speak prop configured', async () => {
    // No `speak` prop at all — the RippleApp/LiveApp integration point when narration hasn't been
    // wired, or the reader simply hasn't opted in. openAsk must not depend on it.
    const { getByText, getByLabelText, queryByPlaceholderText } = render(
      <RippleOverlay model={SEED_SHIP} cfg={cfg} onClose={() => undefined} />,
    );

    expect(queryByPlaceholderText(/Ask about this repo or PR/i)).toBeNull();

    fireEvent.click(getByText('src/auth').closest('button')!);
    fireEvent.click(getByText(/Ask about src\/auth/i));

    const expected =
      'Explain src/auth — Issues and verifies tokens; this PR reshapes validateToken and adds rotation.';
    await waitFor(() =>
      expect((getByLabelText('Ask about this repo or PR') as HTMLTextAreaElement).value).toBe(
        expected,
      ),
    );
  });

  it('still opens the rail (honest, connect-a-model state) with no cfg at all', async () => {
    const { getByText, getByRole, queryByLabelText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );

    fireEvent.click(getByText('src/auth').closest('button')!);
    fireEvent.click(getByText(/Ask about src\/auth/i));

    expect(queryByLabelText('Ask about this repo or PR')).toBeNull(); // no model → no input form
    await waitFor(() => expect(getByRole('region', { name: 'Ask' })).toBeTruthy());
    expect(getByRole('button', { name: 'Close the ask rail' })).toBeTruthy(); // header reflects it
    expect(getByText(/Connect a model in Settings/i)).toBeTruthy(); // …but says so honestly
  });

  // Live hands the overlay a ModelConfig whether or not a key is set, so a keyless reader used to
  // get the full composer — preset chips and a send button that could only ever fail. The honest
  // state has to be reachable from the config Live actually passes, not just from a null one.
  it('shows the same honest state for a config carrying no key', async () => {
    const { getByText, getByRole, queryByLabelText } = render(
      <RippleOverlay
        model={SEED_SHIP}
        cfg={{ provider: 'anthropic', model: 'claude-test', apiKey: '' }}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(getByText('src/auth').closest('button')!);
    fireEvent.click(getByText(/Ask about src\/auth/i));

    await waitFor(() => expect(getByRole('region', { name: 'Ask' })).toBeTruthy());
    expect(queryByLabelText('Ask about this repo or PR')).toBeNull();
    expect(getByText(/Connect a model in Settings/i)).toBeTruthy();
  });

  it('cleans model-authored node prose before narration', async () => {
    const speak = vi.fn();
    const model: ShipModel = {
      ...SEED_SHIP,
      nodes: SEED_SHIP.nodes.map((node) =>
        node.id === 'auth'
          ? {
              ...node,
              problem: 'See [the docs](https://example.com/auth) before rollout.',
              fix: undefined,
            }
          : node,
      ),
    };
    const { getByRole, getByText } = render(
      <RippleOverlay model={model} speak={speak} onClose={() => undefined} />,
    );

    fireEvent.click(getByRole('button', { name: /Turn narration on/i }));
    fireEvent.click(getByText('src/auth').closest('button')!);
    fireEvent.click(getByText(/Ask about src\/auth/i));

    await waitFor(() =>
      expect(speak).toHaveBeenCalledWith('src/auth. See the docs before rollout.'),
    );
  });
});

describe('LessonBody — "Ask about this lesson"', () => {
  afterEach(cleanup);

  const course: ShipCourse = { title: 'Foundations', lessons: [] };
  const lesson: CourseLesson = {
    title: 'Reading the auth guard',
    goal: 'Understand how a request gets checked.',
    read: ['src/auth/guard.ts'],
    concepts: [],
  };

  it('asks a question naming the course and lesson', () => {
    const onAskAboutLesson = vi.fn();
    const { getByText } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        onAskAboutLesson={onAskAboutLesson}
      />,
    );

    fireEvent.click(getByText('Ask about this lesson'));
    expect(onAskAboutLesson).toHaveBeenCalledWith(
      'In "Foundations" — Reading the auth guard: Understand how a request gets checked.',
    );
  });

  it('hides the chip when no handler is wired', () => {
    const { queryByText } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
      />,
    );
    expect(queryByText('Ask about this lesson')).toBeNull();
  });

  it('cleans model-authored walkthrough prose before narration', async () => {
    const speak = vi.fn();
    const narratedLesson: CourseLesson = {
      ...lesson,
      detail: {
        overview: 'How the guard works.',
        walkthrough: [
          {
            file: 'src/auth/guard.ts',
            focus: 'validateToken',
            explain: 'Read [the contract](https://example.com/contract) first.',
          },
        ],
        concepts: [],
        pitfalls: [],
      },
    };
    const { getByRole } = render(
      <LessonBody
        course={course}
        lesson={narratedLesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        speak={speak}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Step through the code one part at a time' }));

    await waitFor(() =>
      expect(speak).toHaveBeenCalledWith('validateToken. Read the contract first.'),
    );
  });
});

// ShipMigration used to render a FIXED "NOT NULL DEFAULT / checkout outage / no payment can be
// written" paragraph for every migration, regardless of what the real diff's SQL does — a fabricated,
// business-domain-specific claim over top of a real user's schema change (a DROP COLUMN or an index
// add would get the exact same "checkout outage" story). The explanation must be derived from the
// real `sql` text: only a genuine NOT NULL … DEFAULT add gets that specific claim; anything else gets
// an honest, generic caution with no invented domain (no "checkout", no "payment").
describe('ShipMigration — the explanation is grounded in the real SQL, never fabricated', () => {
  const NOT_NULL_DEFAULT_DIFF = `diff --git a/migrations/0042.sql b/migrations/0042.sql
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/migrations/0042.sql
@@ -0,0 +1,2 @@
+ALTER TABLE refresh_tokens
+  ADD COLUMN token_version INT NOT NULL DEFAULT 0;
`;

  const DROP_COLUMN_DIFF = `diff --git a/migrations/0043.sql b/migrations/0043.sql
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/migrations/0043.sql
@@ -0,0 +1,1 @@
+ALTER TABLE audit_log DROP COLUMN legacy_note;
`;

  it('a genuine NOT NULL DEFAULT add gets the specific, general SQL-fact explanation', () => {
    const model = buildShipFromDiff(parseUnifiedDiff(NOT_NULL_DEFAULT_DIFF));
    const { getByText, queryByText } = render(<ShipMigration model={model} altitude="working" />);
    expect(getByText('Why this locks writes')).toBeTruthy();
    // Never a fabricated, domain-specific story the diff can't actually prove.
    expect(queryByText(/checkout/i)).toBeNull();
    expect(queryByText(/payment/i)).toBeNull();
  });

  it('a migration with no NOT NULL DEFAULT gets an honest generic caution, not the fixed story', () => {
    const model = buildShipFromDiff(parseUnifiedDiff(DROP_COLUMN_DIFF));
    const { getByText, queryByText } = render(<ShipMigration model={model} altitude="working" />);
    expect(getByText('Why this is worth a second look')).toBeTruthy();
    expect(queryByText(/NOT NULL DEFAULT/)).toBeNull();
    expect(queryByText(/checkout/i)).toBeNull();
    expect(queryByText(/payment/i)).toBeNull();
  });

  it('says so honestly when the diff has no schema change at all', () => {
    const model = buildShipFromDiff(
      parseUnifiedDiff(
        `diff --git a/src/api/refresh.ts b/src/api/refresh.ts\n--- a/src/api/refresh.ts\n+++ b/src/api/refresh.ts\n@@ -1,1 +1,1 @@\n-old()\n+new()\n`,
      ),
    );
    expect(model.migration).toBeUndefined();
    const { getByText } = render(<ShipMigration model={model} altitude="working" />);
    expect(getByText('No schema migration in this change.')).toBeTruthy();
  });
});

// The perceived-speed guarantee. The deterministic floor must paint the
// instant a change is analysed, WITHOUT waiting for the model. GitHub is the intake now, so we drive
// the SAME path the app uses: mock the browser-direct reader so `fetchPrDiff` returns a real diff, type
// a PR URL, hit Analyze. The GitHub read is async (unlike the old synchronous paste), so the floor is
// asserted once the (mocked, instant) fetch resolves — the guarantee is "no waiting for the MODEL":
// enrichment is stubbed with a promise that never resolves (a stand-in for a slow model) and the
// verdict + change land with only a non-blocking "sharpening" cue, never the old full-screen wall.
// Also covers the honest failure path: when enrichment resolves `null` (a genuine failure, not a slow
// model), the floor still stands but the overlay says so and offers a retry — never a silent floor
// passed off as a real read.
describe('Ripple floor-first + the honest failure path', () => {
  afterEach(() => {
    cleanup();
    enrichShipModel.mockReset();
    enrichShipModel.mockImplementation(() => new Promise(() => {}));
  });

  const PR_URL = 'github.com/acme/widget/pull/482';

  describe('Ripple floor-first', () => {
    it('paints the floor verdict immediately, with a non-blocking sharpening cue', async () => {
      const { getByText, getByRole, getByPlaceholderText, findByText, queryByText } = render(
        <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
      );

      // Open the intake (GitHub-first), point it at a real PR, and analyze.
      fireEvent.click(getByText(/Run on your own code/i));
      fireEvent.change(getByPlaceholderText(/github\.com\/owner\/repo\/pull/i), {
        target: { value: PR_URL },
      });
      fireEvent.click(getByRole('button', { name: /^Analyze$/i }));

      // Once the (mocked, instant) fetch resolves — with NO awaiting the model — the floor verdict is on
      // screen…
      expect(await findByText(/^(Hold|Review first|Clear to ship)$/)).toBeTruthy();
      // …and the only "still working" signal is the subtle inline cue, NOT a full-screen blocker.
      expect(getByText(/Sharpening with the model/i)).toBeTruthy();
      // The old full-screen "Analyzing …" wall is gone.
      expect(queryByText(/^Analyzing /i)).toBeNull();
    });
  });

  describe('Ripple — honest failure path', () => {
    it('never passes the floor off as a real read: shows a dismissible retry note instead', async () => {
      enrichShipModel.mockImplementation(() => Promise.resolve(null)); // a genuine failure, not a slow model
      const { getByText, getByRole, getByPlaceholderText, findByText, queryByText } = render(
        <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
      );

      fireEvent.click(getByText(/Run on your own code/i));
      fireEvent.change(getByPlaceholderText(/github\.com\/owner\/repo\/pull/i), {
        target: { value: PR_URL },
      });
      fireEvent.click(getByRole('button', { name: /^Analyze$/i }));

      // The grounded floor still stands (once the fetch resolves)…
      expect(await findByText(/^(Hold|Review first|Clear to ship)$/)).toBeTruthy();
      // …and once the failed model call settles, the failure is honest, not silent.
      expect(await findByText(/model’s read didn’t land/i)).toBeTruthy();

      // "Try again" re-runs the same change through the same pipeline — no re-entry needed. The retry
      // reads the real code (grounding) before the model call, so the re-invoke lands a tick later.
      const callsBefore = enrichShipModel.mock.calls.length;
      fireEvent.click(getByRole('button', { name: /Try again/i }));
      await waitFor(() => expect(enrichShipModel.mock.calls.length).toBeGreaterThan(callsBefore));
      expect(await findByText(/model’s read didn’t land/i)).toBeTruthy(); // still failing → shown again

      // Dismissing clears the note without touching the floor underneath.
      fireEvent.click(getByRole('button', { name: /Dismiss/i }));
      expect(queryByText(/model’s read didn’t land/i)).toBeNull();
      expect(getByText(/^(Hold|Review first|Clear to ship)$/)).toBeTruthy();
    });
  });
});
