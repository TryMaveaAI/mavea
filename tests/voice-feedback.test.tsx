import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  kokoroAvailable,
  kokoroKnownAvailable,
  resetKokoroProbe,
  speakKokoroResult,
  kokoroSpeaking,
  subscribeKokoroSpeaking,
} from '../src/voice/kokoro';
import { VoiceOffHint } from '../src/live/VoiceOffHint';
import { VOICE_OFF_HINT } from '../src/live/voiceAvailability';
import { RememberStep } from '../src/live/setup/steps/RememberStep';

// Voice-capability honesty: (a) the /tts/health probe runs ONCE per session and is shared by
// every caller (no 502 noise on every mount), and (b) when Kokoro — the only voice — is down,
// the voice pickers say so (captions only) instead of promising voices that can't play.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetKokoroProbe();
});

beforeEach(() => {
  resetKokoroProbe();
});

describe('kokoroAvailable — cached session probe', () => {
  it('fetches /tts/health exactly once across repeated calls', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(kokoroAvailable()).resolves.toBe(true);
    await expect(kokoroAvailable()).resolves.toBe(true);
    await expect(kokoroAvailable()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/tts/health', { method: 'GET' });
  });

  it('shares one in-flight probe between concurrent callers', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 502 } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([kokoroAvailable(), kokoroAvailable()]);
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a network failure as unavailable (never throws)', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(kokoroAvailable()).resolves.toBe(false);
    await expect(kokoroAvailable()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gates playback on the probe — no speech requests fire while Kokoro is down', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(speakKokoroResult('Hello there, this line stays silent.', 'mavea')).resolves.toBe(
      false,
    );
    await expect(speakKokoroResult('And so does this one.', 'user')).resolves.toBe(false);

    // Only the single health probe — never POST /tts/v1/audio/speech per line.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/tts/health', { method: 'GET' });
  });

  it('publishes speaking transitions without an idle polling timer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const transitions: boolean[] = [];
    const unsubscribe = subscribeKokoroSpeaking(() => transitions.push(kokoroSpeaking()));

    const line = speakKokoroResult('A queued line.', 'mavea');
    expect(kokoroSpeaking()).toBe(true);
    await expect(line).resolves.toBe(false);
    expect(kokoroSpeaking()).toBe(false);
    expect(transitions).toEqual([true, false]);

    unsubscribe();
  });

  it('exposes the settled result synchronously via kokoroKnownAvailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true } as Response)),
    );
    expect(kokoroKnownAvailable()).toBeNull(); // not probed yet
    await kokoroAvailable();
    expect(kokoroKnownAvailable()).toBe(true);
  });

  it('resetKokoroProbe forces a fresh probe', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    await kokoroAvailable();
    resetKokoroProbe();
    expect(kokoroKnownAvailable()).toBeNull();
    await kokoroAvailable();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('VoiceOffHint — honest voice-picker hint', () => {
  it('shows the captions-only hint when Kokoro is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('no kokoro in test'))),
    );
    render(<VoiceOffHint />);
    expect(await screen.findByRole('status')).toHaveTextContent(VOICE_OFF_HINT);
  });

  it('renders nothing when the Kokoro service is up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true } as Response)),
    );
    render(<VoiceOffHint />);
    // Let the probe settle, then confirm no hint appeared.
    await kokoroAvailable();
    expect(screen.queryByText(/captions only/i)).toBeNull();
  });

  it('appears under the wizard Remember step voice pickers when Kokoro is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('no kokoro in test'))),
    );
    render(<RememberStep />);
    // The pickers still offer the named voices (nothing is blocked)…
    expect(screen.getByLabelText('Mavéa speaks as')).toBeInTheDocument();
    // …but the silence is stated honestly: voice off, captions only.
    expect(await screen.findByText(/captions only/i)).toBeInTheDocument();
  });
});
