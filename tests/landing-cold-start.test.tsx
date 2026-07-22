import { render, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

// The landing must cold-start clean and hand a demo card off to the real Live surface with
// nothing preloaded: the recorded sessions live in per-persona lazy chunks that only the demo
// boot itself fetches, so the click is a pure stash-and-navigate. This suite rebuilds the
// module graph fresh (no other suite's imports warming anything) to prove the landing renders
// from zero and the card hand-off is exactly the one-shot flag + hash hop.
describe('landing cold start', () => {
  afterEach(() => {
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('renders from a fresh module graph, and a demo card hands off to Live', async () => {
    vi.resetModules();
    const { FlagshipHost } = await import('../src/flagship/FlagshipHost');
    const { container } = render(<FlagshipHost />);

    // The landing (or at minimum the app shell) must be up — not the RootBoundary fallback.
    await waitFor(() => {
      expect(container.textContent).not.toContain('hit a snag');
      expect(container.querySelector('.mavea-app, .fl-landing, .fl-hero-title')).toBeTruthy();
    });

    // The demo section mounts lazily as it approaches the viewport; once its cards are in,
    // clicking one stashes the persona and navigates — instantly, nothing to wait for.
    await waitFor(() => expect(container.querySelector('.fl-demo-card')).toBeTruthy(), {
      timeout: 8000,
    });
    fireEvent.click(container.querySelector('.fl-demo-card')!);
    expect(sessionStorage.getItem('mavea-demo-persona')).toBe('cfo');
    expect(window.location.hash).toBe('#/live');
  });
});
