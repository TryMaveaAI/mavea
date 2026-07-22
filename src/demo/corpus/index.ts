// Loader for the baked demo shards. Each persona's session lives in its own
// `<persona>.generated.json`, discovered lazily via import.meta.glob — Vite splits every
// shard into its own chunk, fetched only when that persona's demo actually boots. Nothing
// here (or in any eager graph) may import a shard statically: the landing stays lean and the
// Live mount pays nothing for demos it never plays. The double cast below is deliberate — TS
// infers a giant readonly literal from the JSON that doesn't structurally match our unions
// (e.g. `mode: string` vs the `Mode` union), so we assert the shape the baker generated.
import type { DemoConversation } from './types';

const SHARDS = import.meta.glob('./*.generated.json');

/** Load one persona's baked session. Null when the shard doesn't exist or the chunk fetch
 *  fails (offline) — the caller shows an honest error state, never a silent stall. */
export async function loadDemoConversation(persona: string): Promise<DemoConversation | null> {
  const load = SHARDS[`./${persona}.generated.json`];
  if (!load) return null;
  try {
    const mod = (await load()) as { default: unknown };
    return (mod.default as DemoConversation) ?? null;
  } catch {
    return null;
  }
}
