import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { FlagshipHost } from '../src/flagship/FlagshipHost';
import { LiveApp } from '../src/live/LiveApp';

// App-level mount smoke. typecheck + build prove the code compiles; they do NOT prove
// the two surfaces actually render. A single bad import, a hook-order slip, or a voice
// controller that throws when constructed in a Web-Speech-less environment would crash
// only at runtime — these tests catch that, and pin each surface's landing UI.
//
// Fully deterministic: fetch is stubbed (the Live surface probes Kokoro/TTS health and the
// model on mount), so nothing touches the network or real audio.

beforeEach(() => {
  // Both surfaces fire readiness probes on mount (Kokoro `/tts/health`, provider tags).
  // Reject so they fall back to the browser-voice / not-ready path without a real call.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Landing interactions stash one-shot flags (tour mode, demo persona) and can rewrite the
  // hash — real window state that outlives one render. Reset it so a later test's
  // `render(<LiveApp />)` gets its OWN fresh boot instead of silently resuming whatever
  // hand-off state the previous test left behind.
  sessionStorage.clear();
  window.location.hash = '';
});

describe('FlagshipHost (the landing) — mounts and shows the marketing home', () => {
  afterEach(() => {
    localStorage.removeItem('mavea-tour-seen-v1');
  });

  it('renders without crashing', () => {
    expect(() => render(<FlagshipHost />)).not.toThrow();
  });

  it('a first-time visitor sees the landing, not a forced hand-off into the tour', () => {
    localStorage.removeItem('mavea-tour-seen-v1');
    window.location.hash = '';
    render(<FlagshipHost />);
    // The old behavior stashed tour mode and hopped to #/live the instant the home mounted —
    // the landing must now stay put and offer the tour instead of forcing it.
    expect(window.location.hash).not.toBe('#/live');
    expect(screen.getByText(/2-minute guided tour/i)).toBeInTheDocument();
  });

  it('dismissing the tour invite retires it without navigating away', () => {
    localStorage.removeItem('mavea-tour-seen-v1');
    render(<FlagshipHost />);
    fireEvent.click(screen.getByText(/I'll explore on my own/i));
    expect(window.location.hash).not.toBe('#/live');
    expect(screen.queryByText(/2-minute guided tour/i)).not.toBeInTheDocument();
  });

  it('a returning visitor (tour already seen) gets the plain "Watch it work" link', () => {
    localStorage.setItem('mavea-tour-seen-v1', '1');
    render(<FlagshipHost />);
    expect(screen.getByText(/Watch it work/i)).toBeInTheDocument();
    expect(screen.queryByText(/2-minute guided tour/i)).not.toBeInTheDocument();
  });

  it('shows the flagship hero and the entry into Live', () => {
    render(<FlagshipHost />);
    // the flagship hero headline (also echoed in the closing CTA, hence getAllByText).
    expect(screen.getAllByText(/See what it means/i).length).toBeGreaterThanOrEqual(1);
    // the "Open Mavéa" call-to-action that hops to the Live surface — the one consistent label
    // used everywhere on the page (nav + the closing CTA both read it, hence getAllByRole).
    expect(screen.getAllByRole('button', { name: /Open Mavéa/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('mounts the persistent Mavéa face (the presence is always on screen)', () => {
    const { container } = render(<FlagshipHost />);
    // the face is the heart of the surface; it must be present from first paint.
    expect(container.querySelector('.presence')).toBeInTheDocument();
  });

  it('keeps the conversation rail off the landing (it is a session surface)', () => {
    const { container } = render(<FlagshipHost />);
    // The chat transcript rail belongs to a running session (Live), not the landing page —
    // the home shouldn't be dominated by an empty conversation panel. (The flagship hero
    // has its own composer; that's the front door, not the session rail.)
    expect(container.querySelector('.side-rail')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Open Mavéa/i }).length).toBeGreaterThanOrEqual(1);
  });
});

describe('LiveApp (live surface) — mounts and shows the live landing', () => {
  afterEach(() => {
    localStorage.removeItem('mavea-live-setup-v1');
  });

  it('renders without crashing', () => {
    expect(() => render(<LiveApp />)).not.toThrow();
  });

  it('first run: shows the Connect step and Live badge', () => {
    const { container } = render(<LiveApp />);
    // Wizard Connect step headline (replaces the old "Talk to Mavéa —" greeting).
    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
    // the "Live" status badge is in the topbar (visible once out of the wizard).
    const badge = container.querySelector('.live-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Live mode');
  });

  it('returning user: shows the Go hub with the starter chips', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    render(<LiveApp />);
    // The starter chips live on the Go hub's "Or start with one" column.
    expect(screen.getByText(/Build me a budget for a \$5,000 month/i)).toBeInTheDocument();
  });

  it('mounts the Mavéa face on the live surface too', () => {
    const { container } = render(<LiveApp />);
    expect(container.querySelector('.presence')).toBeInTheDocument();
  });
});
