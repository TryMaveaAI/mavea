import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { LiveApp } from '../src/live/LiveApp';
import { MIC_UNSUPPORTED_MSG } from '../src/live/voiceMessages';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { stashSeedQuery } from '../src/live/seedQuery';
import { saveSession, clearSession } from '../src/live/session/store';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { ConversationSpec, Block } from '../src/data/conversation';

// A minimal saved session, enough for LiveApp to restore a prior conversation.
function savePriorSession(question: string): void {
  const blocks: Block[] = [
    {
      type: 'insight',
      id: 'i1',
      col: 12,
      num: '1',
      props: { title: question, summary: 's', conf: 'inferred' },
    } as Block,
  ];
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
    narration: `About ${question}.`,
    mode: 'replace',
    tour: [],
    spec,
    at: Date.now(),
  };
  const history: ChatMessage[] = [
    { role: 'user', content: question },
    { role: 'assistant', content: `Answer to ${question}` },
  ];
  saveSession(history, [frame]);
}

// Render smoke test for the dedicated Live surface. typecheck + build can't catch a
// runtime crash on mount (bad import, hook misuse, voice-controller construction in
// an environment without Web Speech). This proves the surface renders its setup wizard
// (first-run Connect step) and the returning Go hub without throwing. No network.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.removeItem('mavea-live-seed');
  // The session store now keeps an in-memory cache alongside the encrypted on-disk copy (Web
  // Crypto is async-only, so a synchronous read needs somewhere to answer from) — clearing
  // localStorage alone no longer resets it, so a session saved by one test would otherwise leak
  // into whichever test runs next.
  clearSession();
  // Same in-memory-cache story for the Live config store — a test that switches provider (to get
  // a configured "Start talking") must not leak that pick into the next test.
  resetLiveConfig();
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

describe('LiveApp — mounts the setup wizard', () => {
  it('first run: starts on the Connect step', () => {
    // No setup flag in storage → first-run wizard starts at Connect.
    localStorage.removeItem('mavea-live-setup-v1');
    render(<LiveApp />);

    // Connect step headline.
    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
    // Provider tiles for the five supported backends are shown.
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    // The Mavéa face is always present (byte-locked presence layer).
    expect(document.querySelector('.presence')).toBeTruthy();
  });

  it('returning user: skips to the Go hub', () => {
    // Simulate a user who already completed setup, with a model actually connected (a stored
    // key makes the provider read as genuinely ready).
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    render(<LiveApp />);

    // Go hub checklist contains the Model row shortcut.
    expect(screen.getByText('Model')).toBeInTheDocument();
    // Start talking CTA is visible.
    expect(screen.getByRole('button', { name: /Start talking/i })).toBeInTheDocument();
    // The starter chips are present on Go.
    expect(screen.getByText(/Build me a budget/i)).toBeInTheDocument();
    // The Mavéa face is always present.
    expect(document.querySelector('.presence')).toBeTruthy();
  });

  it('returning user with no key set: "Start talking" is honestly gated, not a dead click', () => {
    // Setup is "done" (the ritual was walked once) but the default provider (Gemini) needs a key
    // that was never entered — the exact case that used to make the Go hub's big CTA fire a turn
    // that was guaranteed to fail the instant it reached the model.
    localStorage.setItem('mavea-live-setup-v1', '1');
    render(<LiveApp />);

    expect(screen.queryByRole('button', { name: /^Start talking$/i })).toBeNull();
    const gated = screen.getByRole('button', { name: /Connect a model to start/i });
    expect(gated).toBeInTheDocument();

    // It jumps to Connect rather than starting a turn.
    fireEvent.click(gated);
    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
  });

  it('Go hub: the checklist names the connected default model', () => {
    // Model info now shows where it's relevant, not permanently in the topbar (which moved to
    // the dock's voice strip once a turn exists — see below). Before any turn, the Go hub's own
    // checklist is that place: it's the step you'd revisit to change the model.
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    render(<LiveApp />);
    expect(screen.getByText(/gemini-3\.1-flash-lite/i)).toBeInTheDocument();
  });

  it('a landed turn: the model chip lives in the dock voice strip, not the topbar', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    savePriorSession('an old question about taxes');
    render(<LiveApp />);

    const chip = screen.getByText(/gemini-3\.1-flash-lite/i).closest('.live-model-chip');
    expect(chip).toBeTruthy();
    expect(chip?.closest('.topbar')).toBeNull();
    expect(chip?.closest('.voice-strip')).toBeTruthy();
  });

  it('Create → Dashboard opens the dashboard page', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    savePriorSession('an old question about taxes');
    window.location.hash = '#/live';
    render(<LiveApp />);

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Dashboard/i }));

    expect(window.location.hash).toBe('#/dashboards');
  });
});

// The landing's hero composer hands a typed question over via stashSeedQuery, then routes to
// #/live. How LiveApp treats it depends on whether setup is done on this device: a configured
// user is dropped straight into a real live session; an unconfigured one lands on the setup page
// with the question staged for after the ritual.
describe('LiveApp — landing hand-off seed', () => {
  it('configured user: a seeded question starts the session straight away (no wizard)', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    stashSeedQuery('Explain compound interest like I’m 12.');
    render(<LiveApp />);

    // The session is underway: the Go hub / wizard chrome is gone (a turn is in-flight, with
    // fetch rejecting). The "Start talking" CTA only exists on the wizard, so its absence proves
    // we left it.
    expect(screen.queryByRole('button', { name: /Start talking/i })).toBeNull();
    expect(screen.queryByText(/Which mind should I think with/i)).toBeNull();
    // The seed was consumed so a refresh can't resurrect it.
    expect(sessionStorage.getItem('mavea-live-seed')).toBeNull();
  });

  it('unconfigured user: a seeded question lands on the setup page (Connect step)', () => {
    localStorage.removeItem('mavea-live-setup-v1');
    stashSeedQuery('Map 3 days in Lisbon');
    render(<LiveApp />);

    // First-run wizard shows — the question waits behind the ritual rather than firing a turn.
    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
  });

  it('a saved prior session restores normally when there is no seed', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    savePriorSession('an old question about taxes');
    render(<LiveApp />);

    // No seed → the previous conversation comes back (its question surfaces on the restored
    // canvas — in the answer hero, the insight card, and the session rail).
    expect(screen.getAllByText(/an old question about taxes/i).length).toBeGreaterThan(0);
  });

  it('a seeded question starts a FRESH session — it never resumes a saved one', () => {
    // Regression: with a prior session stored, a new question from the landing used to drop the
    // user back onto the OLD conversation ("went to another session"). It must start clean.
    localStorage.setItem('mavea-live-setup-v1', '1');
    savePriorSession('an old question about taxes');
    stashSeedQuery('Tell me about Portugal');
    render(<LiveApp />);

    // The old conversation's canvas must NOT be restored.
    expect(screen.queryByText('an old question about taxes')).toBeNull();
    expect(sessionStorage.getItem('mavea-live-seed')).toBeNull();
  });
});

describe('LiveApp — mobile session-rail toggle', () => {
  // On phones the session rail collapses to a bottom sheet; this button (hidden by
  // CSS on desktop, but always in the DOM) expands the chaptered moment list.
  it('opens and closes the session sheet', () => {
    render(<LiveApp />);
    const rail = document.querySelector('.side-rail');
    expect(rail).toBeTruthy();

    const toggle = screen.getByRole('button', { name: /^This session$/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(rail).not.toHaveClass('chat-open');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(rail).toHaveClass('chat-open');
    // The label flips so the same control reads as the way back down.
    expect(screen.getByRole('button', { name: /Hide session/i })).toBe(toggle);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(rail).not.toHaveClass('chat-open');
  });
});

// jsdom has no SpeechRecognition, the same situation as Firefox/Safari — clicking any voice
// affordance used to do NOTHING (no listening state, no error). These prove the failure is
// now visible: a friendly inline notice near the composer instead of a dead click.
describe('LiveApp — voice failures are visible (no SpeechRecognition)', () => {
  it('wizard "Start talking" surfaces the unsupported-browser notice instead of a silent no-op', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    render(<LiveApp />);

    fireEvent.click(screen.getByRole('button', { name: /Start talking/i }));

    // The notice is rendered above the composer, as a live status message.
    expect(screen.getByText(MIC_UNSUPPORTED_MSG)).toBeInTheDocument();
  });

  it('the composer mic button surfaces the same notice', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    render(<LiveApp />);
    // Leave the wizard so the rail composer is the active surface.
    fireEvent.click(screen.getByRole('button', { name: /Start talking/i }));

    fireEvent.click(screen.getByRole('button', { name: /Talk to Mavéa/i }));
    expect(screen.getByText(MIC_UNSUPPORTED_MSG)).toBeInTheDocument();
  });

  it('the notice is dismissible', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    render(<LiveApp />);
    fireEvent.click(screen.getByRole('button', { name: /Start talking/i }));
    expect(screen.getByText(MIC_UNSUPPORTED_MSG)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Dismiss voice notice/i }));
    expect(screen.queryByText(MIC_UNSUPPORTED_MSG)).toBeNull();
  });
});
