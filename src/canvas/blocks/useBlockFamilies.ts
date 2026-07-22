// useBlockFamilies.ts — the render gate for the per-family block chunks. All-or-nothing per
// answer, never per block: while any needed family is still fetching, the caller holds the
// whole grid back, then mounts every card in one pass so the reveal stagger plays together —
// no one-by-one pop-in, no placeholder→real swaps. Preloading (loader.preloadBlockFamilies at
// the stream/intent stage) means this is usually already true at first render.
import { useEffect, useState } from 'react';
import { familiesFor, familiesReady, loadFamilies } from './loader';
import type { BlockFamily } from './familyMap';

type BlockLike = { type: string; props?: unknown };

/** True once every family the blocks need is available (or known-failed). */
export function useBlockFamilies(blocks: readonly BlockLike[]): boolean {
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
  useEffect(() => {
    if (familiesReady(fams)) {
      setReady(true);
      return;
    }
    setReady(false);
    let on = true;
    void loadFamilies(key.split(',') as BlockFamily[]).then(() => {
      if (on) setReady(true);
    });
    return () => {
      on = false;
    };
    // `fams` deliberately excluded below: its CONTENT is fully captured by `key`, and depending
    // on the Set itself reintroduces the exact reference-identity churn this hook exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ready;
}
