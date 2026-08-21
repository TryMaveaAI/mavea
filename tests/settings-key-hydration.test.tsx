// A remembered API key is decrypted from IndexedDB asynchronously, so for the first moments of a
// session the in-memory config carries no key at all. Probing readiness in that window tested
// nothing, came back rejected, and painted a perfectly good setup as invalid — then flipped back to
// valid once the vault landed. No key means NO VERDICT, not a bad one.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkReady: vi.fn(),
  previewVoice: vi.fn(),
  stopPreview: vi.fn(),
}));

vi.mock('../src/live/ready', () => ({ checkLiveReady: mocks.checkReady }));
vi.mock('../src/voice/preview', () => ({
  previewVoice: mocks.previewVoice,
  stopPreview: mocks.stopPreview,
}));
vi.mock('../src/live/voiceAvailability', () => ({
  useKokoroAvailable: () => true,
  VOICE_OFF_HINT: 'Voice is unavailable.',
  VOICE_MUTED_HINT: 'Voice is muted.',
}));

import { LiveSettings } from '../src/live/LiveSettings';
import { resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';

beforeEach(() => {
  vi.useFakeTimers();
  resetLiveConfig();
  mocks.checkReady.mockReset();
  mocks.checkReady.mockResolvedValue({ llm: true, tts: false, model: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the readiness probe waits for the key vault', () => {
  it('fires no probe while a key-requiring provider has no key yet', async () => {
    // Gemini needs a key; the config has none because hydrateSecrets has not resolved.
    setLiveConfigV2({ provider: 'gemini', keys: {} });
    render(<LiveSettings />);
    // Well past the 400ms settle the probe effect schedules.
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(mocks.checkReady).not.toHaveBeenCalled();
  });

  it('probes as soon as the key lands', async () => {
    setLiveConfigV2({ provider: 'gemini', keys: {} });
    render(<LiveSettings />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(mocks.checkReady).not.toHaveBeenCalled();

    // What hydrateSecrets does when the encrypted blob finally decrypts.
    act(() => {
      setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'restored-key' } });
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(mocks.checkReady).toHaveBeenCalled();
  });

  it('says the key is missing rather than calling it invalid', async () => {
    setLiveConfigV2({ provider: 'gemini', keys: {} });
    render(<LiveSettings />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(screen.getByText('Add your API key')).toBeInTheDocument();
    expect(screen.queryByText('Invalid API key')).not.toBeInTheDocument();
    expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
  });
});
