// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { synthesize } from '../scripts/build-demo-narration.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('demo narration destination', () => {
  it('keeps corpus text on loopback and refuses redirects regardless of environment overrides', async () => {
    vi.stubEnv('KOKORO_URL', 'https://untrusted.example');
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetch);

    await expect(synthesize('Demo narration')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8880/v1/audio/speech',
      expect.objectContaining({
        redirect: 'error',
        method: 'POST',
        body: expect.stringContaining('Demo narration'),
      }),
    );
  });

  it('propagates a refused redirect without retrying the narration at another address', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('redirect forbidden'));
    vi.stubGlobal('fetch', fetch);
    await expect(synthesize('Demo narration')).rejects.toThrow('redirect forbidden');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects failed or empty voice responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(synthesize('Demo narration')).rejects.toThrow('Kokoro returned 503');
    fetch.mockResolvedValueOnce(new Response(new Uint8Array()));
    await expect(synthesize('Demo narration')).rejects.toThrow('empty audio response');
  });
});
