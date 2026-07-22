// mindshape-signals.test.ts — useSignals triggers each kind at most once per session.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSignals } from '../src/live/mindshape/useSignals';
import type { MindAtom, MindShapeSpec } from '../src/live/mindshape/types';

afterEach(() => {
  vi.useRealTimers();
});

function stable(id: string, kind: MindAtom['kind'] = 'option'): MindAtom {
  return { id, kind, label: id, quote: `q ${id}`, status: 'stable', confidence: 'said' };
}

function spec(atoms: MindAtom[], hasRealTension = false, hasUnsaid = false): MindShapeSpec {
  return {
    center: '',
    atoms,
    links: hasRealTension
      ? [{ from: atoms[0]?.id ?? 'a', to: atoms[1]?.id ?? 'b', kind: 'tensions' }]
      : [],
    unsaid: hasUnsaid
      ? { label: 'the real thing', why: 'keeps circling it', confidence: 'maybe' }
      : undefined,
  };
}

describe('useSignals', () => {
  it('returns null when there are no atoms', () => {
    const { result } = renderHook(() =>
      useSignals({ center: '', atoms: [], links: [] }, 'listening'),
    );
    expect(result.current.currentSignal).toBeNull();
  });

  it('fires the pattern signal when atoms reach 4', () => {
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    const { result } = renderHook(() => useSignals(spec(atoms), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('pattern');
    expect(result.current.currentSignal?.content).toMatch(/forming/i);
  });

  it('fires the tension signal when a real (non-provisional) tension appears', () => {
    const atoms = [stable('a'), stable('b')];
    const { result } = renderHook(() => useSignals(spec(atoms, true), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('tension');
  });

  it('does NOT fire tension signal for a provisional link', () => {
    const atoms = [stable('a'), stable('b')];
    const provisionalSpec: MindShapeSpec = {
      center: '',
      atoms,
      links: [{ from: 'a', to: 'b', kind: 'tensions', provisional: true }],
    };
    const { result } = renderHook(() => useSignals(provisionalSpec, 'listening'));
    // May fire pattern if enough atoms, but not tension
    expect(result.current.currentSignal?.kind).not.toBe('tension');
  });

  it('fires the unsaid signal when spec.unsaid appears', () => {
    const atoms = [stable('a'), stable('b')];
    const { result } = renderHook(() => useSignals(spec(atoms, false, true), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('unsaid');
  });

  it('fires the depth signal at 8+ atoms', () => {
    const atoms = Array.from({ length: 8 }, (_, i) => stable(`a${i}`));
    const { result } = renderHook(() => useSignals(spec(atoms), 'listening'));
    // pattern (≥4) fires first, but with 8 atoms the depth signal should be active
    // (pattern fires for the 4-atom threshold; depth should also be queued)
    // The hook replaces signals so depth becomes current after pattern
    // In this test the spec already has 8 atoms, so both triggers fire;
    // depth's useEffect runs after pattern's, making it the current signal.
    expect(result.current.currentSignal?.kind).toBe('depth');
  });

  it('clears signals when phase goes to idle', () => {
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    type Props = { s: MindShapeSpec | null; p: 'listening' | 'idle' | 'pausing' | 'settled' };
    const { result, rerender } = renderHook(({ s, p }: Props) => useSignals(s, p), {
      initialProps: { s: spec(atoms) as MindShapeSpec | null, p: 'listening' as Props['p'] },
    });
    expect(result.current.currentSignal).not.toBeNull();

    act(() => {
      rerender({ s: null, p: 'idle' });
    });
    expect(result.current.currentSignal).toBeNull();
  });

  it('does not fire signals during settled phase', () => {
    const atoms = Array.from({ length: 8 }, (_, i) => stable(`a${i}`));
    const { result } = renderHook(() => useSignals(spec(atoms), 'settled'));
    expect(result.current.currentSignal).toBeNull();
  });

  it('does not wake or re-render while a signal is still live', () => {
    vi.useFakeTimers();
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSignals(spec(atoms), 'listening');
    });
    expect(result.current.currentSignal?.kind).toBe('pattern');

    const before = renders;
    act(() => {
      vi.advanceTimersByTime(3_000); // comfortably inside the 5s TTL
    });
    expect(renders).toBe(before);
    expect(result.current.currentSignal?.kind).toBe('pattern');
  });

  it('still expires the signal once its TTL passes', () => {
    vi.useFakeTimers();
    const atoms = [stable('a'), stable('b'), stable('c'), stable('d')];
    const { result } = renderHook(() => useSignals(spec(atoms), 'listening'));
    expect(result.current.currentSignal?.kind).toBe('pattern');

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(result.current.currentSignal).toBeNull();
  });
});
