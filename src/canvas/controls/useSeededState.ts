import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Local exploration state seeded from props that **re-seeds when its key changes**.
 *
 * The viz blocks are interactive (drag an operating point, scrub a cursor), but their data
 * arrives fresh on every model turn. The existing interactive blocks (DataTable, Quiz) never
 * reset — once you pick, the pick sticks — which is wrong here: a new answer must reset the
 * exploration to the new real data, not strand a stale index from the previous answer.
 *
 * This uses the documented React "adjust state during render" pattern (compare a stored key,
 * set state inline when it changed). React discards the in-progress render and immediately
 * re-renders with the new value before committing, so there is no extra effect and no flash.
 * Pass a cheap, stable `key` that changes exactly when the seed should be re-applied (e.g.
 * `` `${title}|${points.length}` ``) — not the seed object itself, which is recomputed each render.
 */
export function useSeededState<T>(seed: T, key: unknown): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(seed);
  const [prevKey, setPrevKey] = useState(key);
  if (!Object.is(prevKey, key)) {
    setPrevKey(key);
    setValue(seed);
  }
  return [value, setValue];
}
