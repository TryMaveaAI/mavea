// The pin sheet snapshots the board list once on open, deliberately, so it can't reshuffle under
// the cursor mid-choice. But dashboards are encrypted at rest and this sheet opens from Live —
// whose route never waits on that decrypt — so a quick open snapshotted an empty store and latched
// it forever: every board the user owns hidden, and a "New dashboard" naming step they never asked
// for. The snapshot now self-corrects once, and only when it was empty to begin with.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { Block } from '../src/data/conversation';

let resolveDecrypt: ((value: unknown) => void) | null = null;
vi.mock('../src/live/contentVault', () => ({
  encryptContent: async (value: unknown) => `ENC:${JSON.stringify(value)}`,
  decryptContent: () =>
    new Promise((resolve) => {
      resolveDecrypt = resolve;
    }),
}));

vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => ({ provider: 'openai', models: {}, keys: { openai: 'k' } }),
  hasModelConfigured: () => true,
  toModelConfig: () => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' }),
}));

const storedDashboard = (id: string, title: string) => ({
  id,
  title,
  question: '',
  thesis: { text: '', saidAt: 0 },
  tripwires: [],
  metrics: [],
  sources: [],
  widgets: [],
  cadence: { data: 'manual', ai: 'manual' },
  alerts: { inApp: true, push: false },
  createdAt: 1,
  updatedAt: 1,
  lastTouchedByUserAt: 1,
  nextDataAt: 0,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
});

const block = {
  id: 'b1',
  type: 'insight',
  col: 6,
  num: '1',
  props: { title: 'A finding' },
} as unknown as Block;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  resolveDecrypt = null;
  // A store that exists on disk but has not been decrypted yet — the real cold-open state.
  localStorage.setItem('mavea-dashboards-v1', 'ENC:existing');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('PinToDashboard — opened before the store finished decrypting', () => {
  it('shows the real boards once the decrypt lands, instead of latching the empty list', async () => {
    const { PinToDashboard } = await import('../src/live/dashboards/PinToDashboard');
    const { queryByText, findByText } = render(<PinToDashboard block={block} onClose={() => {}} />);

    // Nothing decrypted yet: the sheet has no boards to offer and opens on the naming step.
    expect(queryByText('Watchlist')).toBeNull();

    await act(async () => {
      resolveDecrypt?.([storedDashboard('d1', 'Watchlist')]);
      await Promise.resolve();
    });

    expect(await findByText('Watchlist')).toBeTruthy();
  });

  it('leaves a half-typed name alone when the decrypt lands mid-edit', async () => {
    const { PinToDashboard } = await import('../src/live/dashboards/PinToDashboard');
    const { getByLabelText } = render(<PinToDashboard block={block} onClose={() => {}} />);

    const input = getByLabelText('Dashboard name');
    fireEvent.change(input, { target: { value: 'My own name' } });

    await act(async () => {
      resolveDecrypt?.([storedDashboard('d1', 'Watchlist')]);
      await Promise.resolve();
    });

    // Still naming, still carrying what was typed — the list is reachable via Back.
    expect(getByLabelText('Dashboard name')).toHaveValue('My own name');
  });
});
