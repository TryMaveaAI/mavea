// The walkthrough opens the real Model settings for its connect step. The key field there is
// bound to the reader's own vault, so a recorded or screen-shared tour would put their real key
// on screen behind the mask — it shows a stand-in instead, and cannot be edited into the vault.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig, setLiveConfigV2, getLiveConfigV2 } from '../src/live/useLiveConfig';

afterEach(() => {
  cleanup();
  resetLiveConfig();
});

describe('walkthrough key field', () => {
  it('shows a stand-in instead of the stored key, read-only', () => {
    setLiveConfigV2({
      ...getLiveConfigV2(),
      keys: { ...getLiveConfigV2().keys, gemini: 'AIza-real-secret' },
    });
    render(<LiveSettings initialTab="model" sampleKey />);
    const input = screen.getByLabelText(/api key/i) as HTMLInputElement;
    expect(input.value).not.toContain('AIza-real-secret');
    expect(input.value.length).toBeGreaterThan(20);
    expect(input.readOnly).toBe(true);
  });

  it('binds to the vault when no tour is running', () => {
    setLiveConfigV2({
      ...getLiveConfigV2(),
      keys: { ...getLiveConfigV2().keys, gemini: 'AIza-real-secret' },
    });
    render(<LiveSettings initialTab="model" />);
    const input = screen.getByLabelText(/api key/i) as HTMLInputElement;
    expect(input.value).toBe('AIza-real-secret');
    expect(input.readOnly).toBe(false);
  });
});
