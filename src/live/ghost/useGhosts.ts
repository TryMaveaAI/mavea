// The ghost-blocks driver: while the user talks, debounce the growing transcript and fire a
// tiny speculative glimpse; reshape the ghosts as the sentence changes direction. Capped per
// listen (a long ramble doesn't stream tokens forever), abortable, and cleared the instant
// listening ends — the real turn replaces speculation with the actual answer.
import { useEffect, useRef, useState } from 'react';
import { speculate, type GhostCard } from './speculate';
import { completeWordsOnly } from '../mindshape/localExtract';
import type { ModelConfig } from '../providers/types';

/** Wait for the transcript to hold still this long before glimpsing. */
const SETTLE_MS = 700;
/** Don't bother before the ask has any shape at all. */
const MIN_WORDS = 4;
/** Most glimpses per listen — bounds the speculative token spend. */
const MAX_GLIMPSES = 3;

export function useGhosts(
  listening: boolean,
  partial: string | null,
  cfg: ModelConfig | null,
  /** Hold speculation while a real turn is in flight — the answer is already on its way, so a
   *  glimpse of it would bill the user's key to guess at what they're about to be shown anyway.
   *  Kept separate from `listening` so pausing doesn't refund the per-listen glimpse budget. */
  suspended = false,
): GhostCard[] {
  const [ghosts, setGhosts] = useState<GhostCard[]>([]);
  const glimpses = useRef(0);
  const lastSeen = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  // Listening toggles: reset the budget on start, drop everything on end.
  useEffect(() => {
    glimpses.current = 0;
    lastSeen.current = '';
    if (!listening) {
      abortRef.current?.abort();
      setGhosts([]);
    }
  }, [listening]);

  // The real answer takes over the moment it starts: drop the speculation rather than letting a
  // stale glimpse land underneath it.
  useEffect(() => {
    if (suspended) {
      abortRef.current?.abort();
      setGhosts([]);
    }
  }, [suspended]);

  useEffect(() => {
    if (!listening || !cfg || suspended) return;
    // Guard against the in-progress trailing word: a partial like "tell me about Ind" must not make
    // the model riff on the half-heard "Ind". Speculate only on the words that have fully landed.
    const text = completeWordsOnly((partial ?? '').trim());
    if (text.split(/\s+/).filter(Boolean).length < MIN_WORDS) return;
    if (text === lastSeen.current || glimpses.current >= MAX_GLIMPSES) return;
    const timer = window.setTimeout(() => {
      lastSeen.current = text;
      glimpses.current += 1;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      void speculate(text, cfg, abort.signal).then((cards) => {
        if (!abort.signal.aborted && cards.length) setGhosts(cards);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [listening, partial, cfg, suspended]);

  // Unmount safety: nothing speculative survives the surface.
  useEffect(() => () => abortRef.current?.abort(), []);

  return listening && !suspended ? ghosts : [];
}
