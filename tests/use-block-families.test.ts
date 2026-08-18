// useBlockFamilies — the render gate for the per-family block chunks. Three hazards this hook
// must be resilient to, all hit in production:
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
//  3. `ready` is MONOTONIC WITHIN AN ANSWER: a streamed block introducing a new family must not
//     blank the cards already on screen back to skeletons — the gate re-arms only when
//     `answerId` changes.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

const state = vi.hoisted(() => ({
  loaded: new Set<string>(),
  pending: [] as (() => void)[],
}));

vi.mock('../src/canvas/blocks/loader', () => ({
  // The mock treats the block's `type` as its family; a NEW Set every call, on purpose —
  // mirrors the real fn.
  familiesFor: (blocks: readonly { type: string }[]) => new Set(blocks.map((b) => b.type)),
  familiesReady: (fams: Iterable<string>) => {
    for (const f of fams) if (!state.loaded.has(f)) return false;
    return true;
  },
  loadFamilies: (fams: string[]) =>
    new Promise<void>((resolve) => {
      state.pending.push(() => {
        for (const f of fams) state.loaded.add(f);
        resolve();
      });
    }),
}));

import { useBlockFamilies } from '../src/canvas/blocks/useBlockFamilies';

beforeEach(() => {
  state.loaded = new Set();
  state.pending = [];
});

const resolveLoads = async () => {
  await act(async () => {
    for (const finish of state.pending.splice(0)) finish();
    await Promise.resolve();
  });
};

describe('useBlockFamilies', () => {
  it('flips to ready once the family loads, even when re-rendered with a new (same-content) blocks array every time', async () => {
    const { result, rerender } = renderHook(({ blocks }) => useBlockFamilies(blocks, 'answer-1'), {
      initialProps: { blocks: [{ type: 'everyday' }] as { type: string }[] },
    });
    expect(result.current).toBe(false);

    // Simulate the exact bug scenario: several re-renders while the load is still in flight, each
    // handing the hook a BRAND NEW array reference (same content) — as an unmemoized caller would.
    rerender({ blocks: [{ type: 'everyday' }] });
    rerender({ blocks: [{ type: 'everyday' }] });
    expect(result.current).toBe(false); // still loading — no premature/false-positive ready

    await resolveLoads();
    expect(result.current).toBe(true);
  });

  it('is ready immediately when the family is already loaded at mount', () => {
    state.loaded.add('everyday');
    const { result } = renderHook(() => useBlockFamilies([{ type: 'everyday' }], 'answer-1'));
    expect(result.current).toBe(true);
  });

  it('stays ready when a streamed block introduces a NEW family mid-answer', async () => {
    state.loaded.add('everyday');
    const { result, rerender } = renderHook(({ blocks }) => useBlockFamilies(blocks, 'answer-1'), {
      initialProps: { blocks: [{ type: 'everyday' }] as { type: string }[] },
    });
    expect(result.current).toBe(true);

    // A late block needs 'spatial', which is NOT loaded yet — the grid must hold, not blank.
    rerender({ blocks: [{ type: 'everyday' }, { type: 'spatial' }] });
    expect(result.current).toBe(true);
    expect(state.pending.length).toBe(1); // …while the new family's chunk is fetched

    await resolveLoads();
    expect(result.current).toBe(true);
  });

  it('re-arms the gate for a NEW answer whose family is not loaded', async () => {
    state.loaded.add('everyday');
    const { result, rerender } = renderHook(
      ({ blocks, answerId }) => useBlockFamilies(blocks, answerId),
      {
        initialProps: {
          blocks: [{ type: 'everyday' }] as { type: string }[],
          answerId: 'answer-1',
        },
      },
    );
    expect(result.current).toBe(true);

    rerender({ blocks: [{ type: 'novel' }], answerId: 'answer-2' });
    expect(result.current).toBe(false); // a genuinely new answer gates again

    await resolveLoads();
    expect(result.current).toBe(true);
  });
});
