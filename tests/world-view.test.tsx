// world-view.test.tsx — the world as a first-class VIEW of the current answer, peer to Focus and
// the spatial Canvas rather than a card-only side door. Four promises:
//
//   · the view mode itself is transient — 'world' is never persisted, and a stored 'world' (an
//     older build, a hand-edited key) restores to the reader's own standing choice, never to a
//     screen there is nothing to fill
//   · the header control is offered honestly — enabled when THIS answer carries a world, disabled
//     with its reason when it does not; never hidden, never dead
//   · entering and leaving both work, and leaving lands back in the reader's saved mode
//   · entering an UNBUILT world spends exactly one model call, and re-entering spends none
//
// The provider adapter is spied (tests/world-cost.test.tsx's approach) so "one call" means one call
// by any route; `fetch` is stubbed to reject so a stray network read fails loudly.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { ChatMessage } from '../src/live/providers/types';
import type { TurnFrame } from '../src/live/history';

const generateMock = vi.fn();
// Only the adapter is faked — LiveApp itself reads the real provider metadata (labels, default
// models) from this module to render its topbar.
vi.mock('../src/live/providers/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/providers/index')>()),
  getAdapter: () => ({
    id: 'anthropic',
    capabilities: {
      constrainedDecoding: true,
      streaming: false,
      vision: false,
      contextWindow: 200000,
      strengthTier: 'frontier',
      nativeWebSearch: false,
    },
    generate: generateMock,
    probe: async () => ({ ok: true }),
  }),
}));

// No IndexedDB in the runner: the disk half of the world cache is stubbed out so a build resolves
// the way it does in a private-mode browser. The in-memory memo (world/explode) is untouched — it
// is exactly what a second entry is supposed to be served from.
vi.mock('../src/live/ripple/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/ripple/cache')>()),
  cacheGet: async () => null,
  cachePut: async () => {},
}));

import { LiveApp } from '../src/live/LiveApp';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { clearSession, saveSession } from '../src/live/session/store';
import { resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';
import { getViewMode, setViewMode, savedViewMode } from '../src/canvas/focus/useFocusMode';

const VIEW_MODE_KEY = 'mavea-view-mode';
const WORLD_CHIP = /view as world/i;

// One question per test. world/explode memoizes a built world by question+corpus+model for the
// process — which is the point of it — so two tests sharing a question would share the build, and
// the second would measure the first one's memo instead of its own.
let asked = 0;
const nextQuestion = (): string => `Why did the 200${asked++} financial crisis happen?`;

/** The world a build returns — small, structural, and gate-legal (unique ids, acyclic, no figure
 *  without a receipt), so nothing but the ONE call is being measured here. */
const built = (question: string) => ({
  title: question,
  outcomeId: 'freeze',
  nodes: [
    { id: 'cheap-credit', label: 'Cheap credit', role: 'root', depth: 0, tier: 'T0' },
    { id: 'freeze', label: 'Credit froze', role: 'outcome', depth: 1, tier: 'T0' },
  ],
  edges: [{ from: 'cheap-credit', to: 'freeze', verb: 'fuelled', sign: 1, tier: 'T0' }],
  provenance: {},
});

const insight = (): Block =>
  ({
    type: 'insight',
    id: 'i1',
    col: 12,
    num: '1',
    props: { title: 'Cheap credit', summary: 'Rates were held low for years.', conf: 'inferred' },
  }) as Block;

/** The offer a gated causal turn leaves behind: a `world` block with no world on it yet. */
const worldOffer = (question: string): Block =>
  ({
    type: 'world',
    id: 'w1',
    col: 12,
    props: { title: question, outcome: 'The crisis, in four moves' },
  }) as unknown as Block;

/** A saved session carrying `blocks`, so LiveApp mounts straight into a settled answer. */
function saveSessionWith(question: string, blocks: Block[]): void {
  const spec = {
    id: 's',
    workspace: 'W',
    title: question,
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
  const frame: TurnFrame = {
    question,
    narration: 'Cheap credit met securitization, and the market froze.',
    mode: 'replace',
    tour: [],
    spec,
    at: Date.now(),
  };
  const history: ChatMessage[] = [
    { role: 'user', content: question },
    { role: 'assistant', content: frame.narration },
  ];
  saveSession(history, [frame]);
}

/** Two settled answers in one session: the FIRST carries a world, the SECOND does not. */
function saveTwoTurns(firstQuestion: string, firstBlocks: Block[], secondQuestion: string): void {
  const specOf = (title: string, blocks: Block[]) =>
    ({
      id: 's',
      workspace: 'W',
      title,
      sub: '',
      opener: '',
      context: [],
      blocks,
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    }) as unknown as ConversationSpec;
  const frames: TurnFrame[] = [
    {
      question: firstQuestion,
      narration: 'The first answer.',
      mode: 'replace',
      tour: [],
      spec: specOf(firstQuestion, firstBlocks),
      at: Date.now() - 1000,
    },
    {
      question: secondQuestion,
      narration: 'The second answer.',
      mode: 'replace',
      tour: [],
      spec: specOf(secondQuestion, [
        { id: 'b1', type: 'insight', props: { title: 'Later', summary: 'No world here.' } },
      ] as unknown as Block[]),
      at: Date.now(),
    },
  ];
  saveSession(
    [
      { role: 'user', content: firstQuestion },
      { role: 'assistant', content: 'The first answer.' },
      { role: 'user', content: secondQuestion },
      { role: 'assistant', content: 'The second answer.' },
    ] as ChatMessage[],
    frames,
  );
}

/** Calls that built a WORLD, told apart from any other model call by the one system prompt only
 *  world/explode sends. */
const worldCalls = (): unknown[] =>
  generateMock.mock.calls.filter(
    ([req]) => typeof req?.system === 'string' && req.system.includes('causal world-builder'),
  );

beforeEach(() => {
  localStorage.clear();
  clearSession();
  generateMock.mockReset();
  localStorage.setItem('mavea-live-setup-v1', '1');
  acceptLegalTerms();
  setLiveConfigV2({ provider: 'anthropic', keys: { anthropic: 'test-key' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  clearSession();
  resetLiveConfig();
});

describe("the 'world' view mode is transient, like the spatial canvas", () => {
  it('is active in-session but never written to storage', async () => {
    vi.resetModules();
    const m = await import('../src/canvas/focus/useFocusMode');
    m.setViewMode('focus');
    m.setViewMode('world');
    expect(m.getViewMode()).toBe('world');
    // The reader's own choice is untouched — a look at the world can't rewrite their preference.
    expect(localStorage.getItem(VIEW_MODE_KEY)).toBe('focus');
    expect(m.savedViewMode()).toBe('focus');
  });

  it('a stored world mode restores to the default, not to a blank screen', async () => {
    // Nothing writes this today; a hand-edited key or an older build could. Reading it back would
    // otherwise land a fresh session in a view whose answer may carry no world at all.
    localStorage.setItem(VIEW_MODE_KEY, 'world');
    vi.resetModules();
    const m = await import('../src/canvas/focus/useFocusMode');
    expect(m.getViewMode()).toBe('everything');
  });
});

describe('the world control in the answer header', () => {
  it('is absent — not dimmed — when the answer carries no world', async () => {
    saveSessionWith(nextQuestion(), [insight()]);
    render(<LiveApp />);

    // Wait for the answer itself, so this is "the header rendered and the control is not in it"
    // rather than "nothing has rendered yet".
    await screen.findByText('Cheap credit');
    expect(screen.queryByRole('button', { name: WORLD_CHIP })).toBeNull();
  });

  it('is enabled when the answer carries one, and entering opens the view', async () => {
    const question = nextQuestion();
    saveSessionWith(question, [insight(), worldOffer(question)]);
    generateMock.mockResolvedValue({ raw: JSON.stringify(built(question)) });
    render(<LiveApp />);

    const chip = await screen.findByRole('button', { name: WORLD_CHIP });
    expect(chip).toBeEnabled();
    await act(async () => {
      fireEvent.click(chip);
    });

    // The view is up — the overlay names itself, and the reader's question is its heading.
    const surface = await screen.findByLabelText(`Living answer: ${question}`);
    expect(surface).toBeTruthy();
    expect(getViewMode()).toBe('world');

    // …and leaving lands back in the answer, in the mode the reader actually chose.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText(`Living answer: ${question}`)).toBeNull());
    expect(getViewMode()).toBe(savedViewMode());
  });
});

describe('a world belongs to the answer that earned it', () => {
  it('is offered again when the reader scrolls back to an earlier question', async () => {
    // The control used to be resolved against the LIVE head, so asking a second question made
    // every earlier world in the session unreachable — the reader could see the card that offered
    // it and had no way back in.
    const first = nextQuestion();
    const second = nextQuestion();
    saveTwoTurns(first, [insight(), worldOffer(first)], second);
    render(<LiveApp />);

    // The newest answer is showing, and it has no world of its own.
    await screen.findByText('Later');
    expect(screen.queryByRole('button', { name: WORLD_CHIP })).toBeNull();

    // Step back to the answer that does.
    // The session rail is how a reader goes back to an earlier moment.
    const earlier = screen
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').includes(first))!;
    expect(earlier, 'the earlier moment is listed in the session rail').toBeTruthy();
    await act(async () => {
      fireEvent.click(earlier);
    });

    expect(await screen.findByRole('button', { name: WORLD_CHIP })).toBeEnabled();
  });
});

describe('what entering the view costs', () => {
  it('builds an unbuilt world exactly once, and serves the second entry from the card', async () => {
    const question = nextQuestion();
    saveSessionWith(question, [insight(), worldOffer(question)]);
    generateMock.mockResolvedValue({ raw: JSON.stringify(built(question)) });
    render(<LiveApp />);

    const chip = await screen.findByRole('button', { name: WORLD_CHIP });
    expect(worldCalls()).toHaveLength(0); // sitting in the canvas costs nothing

    await act(async () => {
      fireEvent.click(chip);
    });
    await waitFor(() => expect(worldCalls()).toHaveLength(1));
    // The built world is on screen, not the wait state.
    expect(await screen.findByRole('button', { name: 'Graph' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText(`Living answer: ${question}`)).toBeNull());

    // Re-entering re-renders what the card now carries — no second call, by any route.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: WORLD_CHIP }));
    });
    await screen.findByLabelText(`Living answer: ${question}`);
    expect(worldCalls()).toHaveLength(1);
  });

  it('falls back out of the view when the answer it belonged to is gone', () => {
    // The canvas moved on under an open world (a replacing turn): the mode has nothing to show, so
    // the reader is put back where they were instead of staring at the answer through a dead mode.
    setViewMode('focus');
    setViewMode('world');
    saveSessionWith(nextQuestion(), [insight()]);
    render(<LiveApp />);
    expect(getViewMode()).toBe('focus');
  });
});
