// useBlockFamilies.ts — the render gates for the per-family block chunks.
//
// useBlockFamilies holds an answer's FIRST paint: while any family the initial blocks need is
// still fetching, the caller shows skeletons, then mounts every card in one pass so the reveal
// stagger plays together — no one-by-one pop-in. Once `ready` has latched it stays up: a later
// block introducing a NEW family must not blank the cards already on screen, and remounting them
// would replay every entrance and drop the state 250-odd components hold. The effect is keyed on
// the families the blocks need, so a new family is fetched the moment it is needed, whatever the
// spec's id says — a live spec's id is the same for the whole session.
//
// useExtendedRender is the other half: a card whose family is still in flight renders as pending
// and re-renders itself when the chunk lands. It has to be the CELL that listens. A cell is
// memoized, and a canvas-level flag that was already true cannot change when a late family
// arrives, so a card that mounted early otherwise sat on its fallback until something unrelated
// re-rendered it.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  extendedRender,
  familiesFor,
  familiesReady,
  familyPending,
  loadFamilies,
  subscribeFamilies,
} from './loader';
import type { BlockFamily } from './familyMap';

type BlockLike = { type: string; props?: unknown };

/**
 * True once every family the blocks need is available (or known-failed). Monotonic: may flip
 * false→true at any time, and drops back only when `answerId` changes. Pass an id only when it
 * is unique per answer; a canvas that stays mounted across a conversation passes none, and its
 * late families are waited on card by card (useExtendedRender).
 */
export function useBlockFamilies(blocks: readonly BlockLike[], answerId = ''): boolean {
  // familiesFor is a cheap type-string walk — safe to redo every render, unlike memoizing on
  // `blocks`' own identity. A caller that rebuilds its blocks array on every render for reasons
  // unrelated to block content (e.g. a dashboard widget re-projecting live props) would otherwise
  // hand this hook a NEW Set every time even though the actual families needed haven't changed.
  // Key the effect on the families' CONTENT (a sorted, joined string) rather than the Set itself,
  // so an unstable `blocks` reference can't tear down and restart an in-flight load every render.
  const fams = familiesFor(blocks);
  const key = Array.from(fams).sort().join(',');
  // `ready` is real React state, set explicitly — NOT re-derived from familiesReady() on every
  // render. familiesReady() reads mutable state OUTSIDE React (loader.ts's module-level `loaded`
  // map) — with the React Compiler's static memoization, a call whose only visible argument is
  // `fams`/`key` (unchanged across a bump-triggered re-render) can get cached instead of
  // re-evaluated, so a render that SHOULD now see `true` can still read a stale `false` forever.
  // Explicit `setReady` calls are a primitive the compiler can't misread this way.
  const [ready, setReady] = useState(() => familiesReady(fams));
  // The answer `ready` last latched true for — null whenever the gate is armed (ready false).
  const latchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (familiesReady(fams)) {
      latchedFor.current = answerId;
      setReady(true);
      return;
    }
    // Re-arm the gate only across answers. Once latched, the grid stays up while the new
    // family's chunk loads, and its cards wait on it one by one (useExtendedRender).
    if (latchedFor.current !== answerId) {
      latchedFor.current = null;
      setReady(false);
    }
    let on = true;
    void loadFamilies(key.split(',') as BlockFamily[]).then(() => {
      if (on) {
        latchedFor.current = answerId;
        setReady(true);
      }
    });
    return () => {
      on = false;
    };
    // `fams` deliberately excluded below: its CONTENT is fully captured by `key`, and depending
    // on the Set itself reintroduces the exact reference-identity churn this hook exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, answerId]);
  return ready;
}

type ExtendedRenderer = NonNullable<ReturnType<typeof extendedRender>>;

/**
 * The renderer for an extended block type, `'pending'` while its family's chunk is still in
 * flight, or null when there is none (a core type, an unknown one, or a family that failed).
 * The snapshot is the registry's own function reference, so it is stable between loads.
 */
export function useExtendedRender(type: string): ExtendedRenderer | 'pending' | null {
  const render = useSyncExternalStore(subscribeFamilies, () =>
    familyPending(type) ? 'pending' : extendedRender(type),
  );
  const pending = render === 'pending';
  // A card mounted outside any gate still fetches its own family (deduped against the gate's).
  useEffect(() => {
    if (pending) void loadFamilies(familiesFor([{ type }]));
  }, [pending, type]);
  return render;
}
