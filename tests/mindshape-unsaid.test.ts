// mindshape-unsaid.test.ts — confirmUnsaid / dismissUnsaid behavior in useMindShape.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindShape } from '../src/live/mindshape/useMindShape';
import { settleMindShape } from '../src/live/mindshape/modelRefine';
import type { MindShapeSpec } from '../src/live/mindshape/types';
import type { ModelConfig } from '../src/live/providers/types';

vi.mock('../src/live/mindshape/modelRefine', () => ({
  settleMindShape: vi.fn().mockResolvedValue(null),
  patchMindShape: vi.fn().mockResolvedValue(null),
}));

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

const FAKE_CFG: ModelConfig = { provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'k' };

const SPEC_WITH_UNSAID: MindShapeSpec = {
  center: 'Is this about the job or something else?',
  atoms: [
    {
      id: 'a1',
      kind: 'option',
      label: 'Stay',
      quote: 'maybe stay',
      status: 'stable',
      confidence: 'said',
    },
  ],
  links: [],
  unsaid: {
    label: "Maybe it's not about the job at all",
    why: 'Keeps circling it',
    confidence: 'maybe',
  },
};

describe('useMindShape — confirmUnsaid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('promotes the unsaid to a stable open_loop atom and clears spec.unsaid', async () => {
    vi.mocked(settleMindShape).mockResolvedValueOnce(SPEC_WITH_UNSAID);

    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('a long enough topic to trigger the seed call here please');
    });
    await flush();

    // Seed the spec with unsaid
    expect(result.current.spec?.unsaid?.label).toBe("Maybe it's not about the job at all");

    await act(async () => {
      result.current.confirmUnsaid();
    });

    const spec = result.current.spec;
    expect(spec?.unsaid).toBeUndefined();
    const confirmed = spec?.atoms.find((a) => a.id === 'unsaid-confirmed');
    expect(confirmed).toBeDefined();
    expect(confirmed?.kind).toBe('open_loop');
    expect(confirmed?.status).toBe('stable');
    expect(confirmed?.label).toBe("Maybe it's not about the job at all");
  });

  it('is a no-op when there is no unsaid', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.confirmUnsaid(); // should not throw
    });
    expect(result.current.spec).toBeNull();
  });
});

describe('useMindShape — dismissUnsaid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears spec.unsaid without adding an atom', async () => {
    vi.mocked(settleMindShape).mockResolvedValueOnce(SPEC_WITH_UNSAID);

    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.onTranscript('a long enough topic to trigger the seed call here please');
    });
    await flush();

    expect(result.current.spec?.unsaid).toBeDefined();
    const atomsBefore = result.current.spec?.atoms.length ?? 0;

    await act(async () => {
      result.current.dismissUnsaid();
    });

    expect(result.current.spec?.unsaid).toBeUndefined();
    // No new atom added
    expect(result.current.spec?.atoms.length).toBe(atomsBefore);
  });

  it('is a no-op when there is no unsaid', async () => {
    const { result } = renderHook(() => useMindShape(FAKE_CFG));
    await act(async () => {
      result.current.dismissUnsaid();
    });
    expect(result.current.spec).toBeNull();
  });
});
