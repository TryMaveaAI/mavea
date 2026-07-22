// ripple-floor-first.test.tsx — the perceived-speed guarantee. The deterministic floor must paint the
// instant a change is analysed, WITHOUT waiting for the model. GitHub is the intake now, so we drive
// the SAME path the app uses: mock the browser-direct reader so `fetchPrDiff` returns a real diff, type
// a PR URL, hit Analyze. The GitHub read is async (unlike the old synchronous paste), so the floor is
// asserted once the (mocked, instant) fetch resolves — the guarantee is "no waiting for the MODEL":
// enrichment is stubbed with a promise that never resolves (a stand-in for a slow model) and the
// verdict + change land with only a non-blocking "sharpening" cue, never the old full-screen wall.
// Also covers the honest failure path: when enrichment resolves `null` (a genuine failure, not a slow
// model), the floor still stands but the overlay says so and offers a retry — never a silent floor
// passed off as a real read.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

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

import { SEED_SHIP } from '../src/live/ripple/seed';
import { RippleOverlay } from '../src/live/ripple/RippleOverlay';

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
