import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADAPTERS, getAdapter } from '../src/live/providers';
import { configureProviderSpending } from '../src/live/providers/spendPolicy';
import type { ProviderAdapter } from '../src/live/providers/types';

const request = { system: '', history: [], user: 'hello' };
let originalGenerate: ProviderAdapter['generate'];
let originalProbe: ProviderAdapter['probe'];
let originalWarm: ProviderAdapter['warm'];

beforeEach(() => {
  configureProviderSpending(false);
  originalGenerate = ADAPTERS.gemini.generate;
  originalProbe = ADAPTERS.gemini.probe;
  originalWarm = ADAPTERS.anthropic.warm;
});

afterEach(() => {
  ADAPTERS.gemini.generate = originalGenerate;
  ADAPTERS.gemini.probe = originalProbe;
  ADAPTERS.anthropic.warm = originalWarm;
  configureProviderSpending(false);
});

describe('provider spend policy', () => {
  it('blocks every registry generation during a replay before transport runs', async () => {
    const transport = vi.fn().mockResolvedValue({ raw: '{}' });
    ADAPTERS.gemini.generate = transport;
    configureProviderSpending(true);

    await expect(
      getAdapter('gemini').generate(request, {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        apiKey: 'key',
      }),
    ).rejects.toMatchObject({
      code: 'provider-generation-blocked',
      reason: 'replay',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('blocks an unconfigured hosted provider before transport runs', async () => {
    const transport = vi.fn().mockResolvedValue({ raw: '{}' });
    ADAPTERS.gemini.generate = transport;

    await expect(
      getAdapter('gemini').generate(request, {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
      }),
    ).rejects.toMatchObject({ reason: 'unconfigured' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('treats whitespace-only model credentials as unconfigured', async () => {
    const transport = vi.fn().mockResolvedValue({ raw: '{}' });
    ADAPTERS.gemini.generate = transport;

    await expect(
      getAdapter('gemini').generate(request, {
        provider: 'gemini',
        model: '   ',
        apiKey: '   ',
      }),
    ).rejects.toMatchObject({ reason: 'unconfigured' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('blocks readiness probes and warmups throughout a replay', async () => {
    const probe = vi.fn().mockResolvedValue({ ok: true, model: true });
    const warm = vi.fn().mockResolvedValue(undefined);
    ADAPTERS.gemini.probe = probe;
    ADAPTERS.anthropic.warm = warm;
    configureProviderSpending(true);
    const cfg = { provider: 'gemini' as const, model: 'gemini-3.1-flash-lite', apiKey: 'key' };

    await expect(getAdapter('gemini').probe(cfg)).resolves.toEqual({ ok: false, model: false });
    await expect(
      getAdapter('anthropic').warm?.({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'key',
      }),
    ).resolves.toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
    expect(warm).not.toHaveBeenCalled();
  });

  it('delegates dynamically when generation is allowed', async () => {
    const transport = vi.fn().mockResolvedValue({ raw: '{"ok":true}' });
    ADAPTERS.gemini.generate = transport;
    const cfg = { provider: 'gemini' as const, model: 'gemini-3.1-flash-lite', apiKey: 'key' };

    await expect(getAdapter('gemini').generate(request, cfg)).resolves.toEqual({
      raw: '{"ok":true}',
    });
    expect(transport).toHaveBeenCalledOnce();
  });
});
