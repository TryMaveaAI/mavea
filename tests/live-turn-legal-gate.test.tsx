import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

const generateLive = vi.hoisted(() => vi.fn());
vi.mock('../src/live/generateLive', () => ({ generateLive }));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

describe('useLiveTurn — provider authorization gate', () => {
  it('fails closed before loading config or the turn engine', async () => {
    const getConfig = vi.fn(() => cfg);
    const { result } = renderHook(() =>
      useLiveTurn({ canRun: () => false, getConfig, getLibraryEnabled: () => false }),
    );

    await act(() => result.current.run('send this to a provider'));

    expect(getConfig).not.toHaveBeenCalled();
    expect(generateLive).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(result.current.frames).toHaveLength(0);
    expect(result.current.history).toHaveLength(0);
  });
});
