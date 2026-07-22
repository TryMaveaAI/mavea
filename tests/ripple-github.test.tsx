// ripple-github.test.tsx — the GitHub-first front door. The intake opens on the GitHub tab with the
// single smart input, and the launch behaviour is honest: the FIRST open shows the rich worked example
// plainly; EVERY open after opens the GitHub intake on top of it (the example stays one click away).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SEED_SHIP } from '../src/live/ripple/seed';
import { RippleOverlay } from '../src/live/ripple/RippleOverlay';

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

describe('GitHub-first intake', () => {
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
