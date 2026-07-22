// ripple-app-speak.test.tsx — the #/ripple standalone surface (RippleApp) must wire real speech
// into the overlay so the narration toggle (rendered only when a `speak` prop exists) actually
// appears and, once opted in, actually talks — Ripple stays silent-by-default (narration starts
// off), but the affordance must not be a dead end once someone turns it on.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, waitFor } from '@testing-library/react';

const { speakSpy } = vi.hoisted(() => ({ speakSpy: vi.fn() }));
vi.mock('../src/voice/tts', () => ({ speak: speakSpy }));

import { RippleApp } from '../src/live/ripple/RippleApp';

// Each test renders a fresh RippleApp; clear the "seen the worked example" flag so every test
// sees the same plain worked-example landing rather than the GitHub intake re-opening on top.
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  speakSpy.mockClear();
});

describe('RippleApp', () => {
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
