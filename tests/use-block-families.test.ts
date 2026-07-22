// useBlockFamilies — the render gate for the per-family block chunks. Two independent hazards
// this hook must be resilient to, both hit in production:
//  1. A caller that hands it a NEW blocks array on every render (same content, different
//     reference — exactly what an unmemoized WidgetTile did before it was fixed) must still see
//     `ready` flip to true once the family finishes loading. Keying the load-then-retry effect on
//     the `fams` Set BY REFERENCE tore down and restarted an in-flight load on every such render,
//     so a family whose import took longer than one render cycle could get torn down forever,
//     never once surviving to its own `.then()`.
//  2. This app compiles with the React Compiler (babel-plugin-react-compiler), which memoizes an
//     expression based on its visible inputs — `familiesReady(fams)` looks pure to the compiler,
//     but it secretly reads mutable state OUTSIDE React (loader.ts's module-level `loaded` map).
//     Re-deriving `ready` from that call on every render (the original design) risks the compiler
//     caching a stale `false` even after the load completes and a re-render is triggered. `ready`
//     must be real `useState`, set explicitly, not silently re-derived.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

const state = vi.hoisted(() => ({ loaded: false, resolveLoad: null as (() => void) | null }));

vi.mock('../src/canvas/blocks/loader', () => ({
  familiesFor: () => new Set(['everyday']), // a NEW Set every call, on purpose — mirrors the real fn
  familiesReady: (fams: Iterable<string>) => {
    for (const f of fams) if (f === 'everyday' && !state.loaded) return false;
    return true;
  },
  loadFamilies: () =>
    new Promise<void>((resolve) => {
      state.resolveLoad = () => {
        state.loaded = true;
        resolve();
      };
    }),
}));

import { useBlockFamilies } from '../src/canvas/blocks/useBlockFamilies';

beforeEach(() => {
  state.loaded = false;
  state.resolveLoad = null;
});

describe('useBlockFamilies', () => {
  it('flips to ready once the family loads, even when re-rendered with a new (same-content) blocks array every time', async () => {
    const { result, rerender } = renderHook(({ blocks }) => useBlockFamilies(blocks), {
      initialProps: { blocks: [{ type: 'forecast' }] as { type: string }[] },
    });
    expect(result.current).toBe(false);

    // Simulate the exact bug scenario: several re-renders while the load is still in flight, each
    // handing the hook a BRAND NEW array reference (same content) — as an unmemoized caller would.
    rerender({ blocks: [{ type: 'forecast' }] });
    rerender({ blocks: [{ type: 'forecast' }] });
    expect(result.current).toBe(false); // still loading — no premature/false-positive ready

    await act(async () => {
      state.resolveLoad?.();
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });

  it('is ready immediately when the family is already loaded at mount', () => {
    state.loaded = true;
    const { result } = renderHook(() => useBlockFamilies([{ type: 'forecast' }]));
    expect(result.current).toBe(true);
  });
});
