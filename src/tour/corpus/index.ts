// The committed corpus of real conversations the film replays — ~163 KB of baked frames, so the
// JSON arrives through a dynamic import (the loadTourPrism idiom) instead of riding statically.
// tourPlan, the seeds, and LiveApp keep their cheap static imports of THIS module without pinning
// the payload into the Live mount chunk: the bytes are fetched only when loadTourCorpus() runs
// (the driver kicks it off the moment the tour is active, while the visitor reads the corpus-free
// welcome card). Until it resolves the sync reads return empty — every consumer already treats a
// missing conversation as "skip", and the driver's corpusReady gate holds the chapters anyway.
import type { TourCorpus, TourConversation } from './types';

let CORPUS: TourCorpus | null = null;

/** Fetch + cache the baked corpus (lazy — see the module note). Idempotent once resolved. */
export async function loadTourCorpus(): Promise<TourCorpus> {
  if (CORPUS) return CORPUS;
  // The double cast is deliberate: TS infers a giant readonly literal from the JSON that doesn't
  // structurally match our unions (e.g. `mode: string` vs the `Mode` union), so we assert the
  // shape we generated it to.
  const raw = (await import('./corpus.generated.json')) as unknown as { default: TourCorpus };
  CORPUS = raw.default;
  return CORPUS;
}

/** Every real conversation, in order — empty until loadTourCorpus() has resolved. */
export function tourConversations(): readonly TourConversation[] {
  return CORPUS?.conversations ?? [];
}

/** One conversation by slug; undefined when the id isn't baked (or the corpus hasn't loaded). */
export function tourConversation(id: string): TourConversation | undefined {
  return CORPUS?.conversations.find((c) => c.id === id);
}
