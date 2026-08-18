// useBlockFamilies.ts — the render gate for the per-family block chunks. All-or-nothing at an
// answer's FIRST paint, then monotonic within that answer: while any family the initial blocks
// need is still fetching, the caller holds the whole grid back, then mounts every card in one
// pass so the reveal stagger plays together — no one-by-one pop-in, no placeholder→real swaps.
// Once `ready` has latched true for an answer it never drops back for that answer — a streamed
// block introducing a NEW family must not blank the cards already on screen back to skeletons.
// The late family's cards simply appear when their chunk lands (extendedRender returns null for
// a not-yet-loaded family, so the cell is absent until the load resolves and the card mounts).
// Only a genuinely new `answerId` re-arms the gate. Preloading (loader.preloadBlockFamilies at
// the stream/intent stage) means this is usually already true at first render.
import { useEffect, useRef, useState } from 'react';
import { familiesFor, familiesReady, loadFamilies } from './loader';
import type { BlockFamily } from './familyMap';

type BlockLike = { type: string; props?: unknown };

/**
 * True once every family the blocks need is available (or known-failed). Monotonic per answer:
 * may flip false→true at any time, but never true→false while `answerId` is unchanged.
 */
export function useBlockFamilies(blocks: readonly BlockLike[], answerId: string): boolean {
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
    // Re-arm the gate only across answers. Mid-answer (same id, already latched true) the grid
    // stays up while the new family's chunk loads — its cards mount when the load resolves.
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
