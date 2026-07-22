// ground-resolve.test.ts — the four-surface resolver. Locks the honesty invariants that matter most:
// user data resolves to T1 with a receipt, the web path (T2) only survives a verified citation whose
// digits are actually in the quote, and everything else degrades to T0 — a fabricated number can never
// come back as a real value. Search + model are mocked so the test is deterministic and offline.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchMock = vi.fn();
const generateMock = vi.fn();

vi.mock('../src/live/search/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/search/index')>();
  return {
    ...actual,
    getSearchProvider: () => ({ id: 'wikipedia', needsKey: false, search: searchMock }),
  };
});
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import { resolveValue } from '../src/live/ground/resolve';

const cfg = { provider: 'gemini' } as never;

beforeEach(() => {
  searchMock.mockReset();
  generateMock.mockReset();
});

describe('resolveValue — trust order + honesty', () => {
  it("T1: reads the user's own value verbatim with a receipt", async () => {
    const r = await resolveValue('Revenue', 'what is revenue', {
      cfg,
      userData: [{ label: 'Revenue', value: 1200, raw: '$1,200', cell: 'B4' }],
    });
    expect(r).toMatchObject({ ok: true, tier: 'T1', value: 1200, surface: 'user' });
    if (r.ok && r.tier === 'T1') expect(r.receipt.quote).toBe('$1,200');
    expect(generateMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('T1: reads a filled numeric blank', async () => {
    const r = await resolveValue('deadline', 'when', {
      cfg,
      filledBlanks: { deadline: { kind: 'number', key: 'deadline', value: 5, unit: 'wks' } },
    });
    expect(r).toMatchObject({ ok: true, tier: 'T1', value: 5, surface: 'blank' });
  });

  it("dropped: an empty label can't be resolved", async () => {
    expect(await resolveValue('', 'q', { cfg })).toEqual({ ok: false, reason: 'dropped' });
  });

  it('T0: no data + no search degrades to qualitative, NO value fabricated', async () => {
    const r = await resolveValue('churn', 'why did churn rise', { cfg });
    expect(r).toMatchObject({ ok: true, tier: 'T0', surface: 'model' });
    expect(r.ok && 'value' in r).toBe(false);
  });

  it('T2: a verified citation whose digits are in the quote resolves with a receipt', async () => {
    searchMock.mockResolvedValue([
      { title: 'Report', url: 'https://acme.com/r', snippet: 'March churn was 12% overall.' },
    ]);
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        found: true,
        value: 12,
        citationQuote: 'March churn was 12%',
        citationUrl: 'https://acme.com/r',
      }),
    });
    const r = await resolveValue('churn', 'march churn rate', {
      cfg,
      search: { enabled: true },
      speedTier: 'standard',
    });
    expect(r).toMatchObject({ ok: true, tier: 'T2', value: 12, surface: 'web' });
    if (r.ok && r.tier === 'T2') expect(r.receipt.url).toBe('https://acme.com/r');
  });

  it('T2 dropped: an invented citation URL falls back to T0', async () => {
    searchMock.mockResolvedValue([
      { title: 'Report', url: 'https://acme.com/r', snippet: 'March churn was 12% overall.' },
    ]);
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        found: true,
        value: 12,
        citationQuote: 'March churn was 12%',
        citationUrl: 'https://made-up.com/x',
      }),
    });
    const r = await resolveValue('churn', 'q', {
      cfg,
      search: { enabled: true },
      speedTier: 'standard',
    });
    expect(r.ok && r.tier).toBe('T0');
  });

  it('T2 dropped: a value whose digits are NOT in the cited quote is rejected', async () => {
    searchMock.mockResolvedValue([
      { title: 'Report', url: 'https://acme.com/r', snippet: 'March churn was 12% overall.' },
    ]);
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        found: true,
        value: 99,
        citationQuote: 'March churn was 12%',
        citationUrl: 'https://acme.com/r',
      }),
    });
    const r = await resolveValue('churn', 'q', {
      cfg,
      search: { enabled: true },
      speedTier: 'standard',
    });
    expect(r.ok && r.tier).toBe('T0');
  });

  it('slow tier skips the extra web extraction call (protects the serial local slot)', async () => {
    const r = await resolveValue('churn', 'q', {
      cfg,
      search: { enabled: true },
      speedTier: 'slow',
    });
    expect(r.ok && r.tier).toBe('T0');
    expect(searchMock).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });
});
