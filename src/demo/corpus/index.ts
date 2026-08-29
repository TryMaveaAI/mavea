// Loader for the baked demo shards. Each persona's session lives in its own
// `<persona>.generated.json`, discovered lazily via import.meta.glob — Vite splits every
// shard into its own chunk, fetched only when that persona's demo actually boots. Nothing
// here (or in any eager graph) may import a shard statically: the landing stays lean and the
// Live mount pays nothing for demos it never plays. The double cast below is deliberate — TS
// infers a giant readonly literal from the JSON that doesn't structurally match our unions
// (e.g. `mode: string` vs the `Mode` union), so we assert the shape the baker generated.
import { resolvesCellMatrix, resolvesKeyedRows, resolvesTextItems } from '../../canvas/lib/empty';
import type { DemoConversation } from './types';

const SHARDS = import.meta.glob('./*.generated.json');

/** Drop any block a shard froze that can no longer render anything, and re-point the frame's tour
 *  at where its blocks ended up.
 *
 *  A shard is a trusted artifact whose trust was established by whichever validator baked it, and
 *  replay never revisits that judgement — so a block the validator would refuse today survives in
 *  the file forever. One did: a table with five rows that resolved no cells, which drew a header
 *  over five blank lines under a footer confidently reporting "5 of 5 rows". The fix belongs here
 *  rather than in the JSON, which is generated and explicitly not hand-edited. */
function usableFrames(convo: DemoConversation): DemoConversation {
  let changed = false;
  const frames = convo.frames.map((frame) => {
    const blocks = frame.spec.blocks;
    const keep = blocks.map(
      (b) =>
        resolvesKeyedRows(b.type, b.props) &&
        resolvesCellMatrix(b.type, b.props) &&
        resolvesTextItems(b.type, b.props),
    );
    if (keep.every(Boolean)) return frame;
    changed = true;
    // Old index → new index, so a tour keeps pointing at the block it was written about.
    const moved = new Map<number, number>();
    let next = 0;
    keep.forEach((ok, i) => {
      if (ok) moved.set(i, next++);
    });
    const tour = frame.tour
      ?.filter((stop) => moved.has(stop.index))
      .map((stop) => ({ ...stop, index: moved.get(stop.index) as number }));
    return {
      ...frame,
      spec: { ...frame.spec, blocks: blocks.filter((_, i) => keep[i]) },
      ...(tour ? { tour } : {}),
    };
  });
  return changed ? { ...convo, frames } : convo;
}

/** Load one persona's baked session. Null when the shard doesn't exist or the chunk fetch
 *  fails (offline) — the caller shows an honest error state, never a silent stall. */
export async function loadDemoConversation(persona: string): Promise<DemoConversation | null> {
  const load = SHARDS[`./${persona}.generated.json`];
  if (!load) return null;
  try {
    const mod = (await load()) as { default: unknown };
    const convo = (mod.default as DemoConversation) ?? null;
    return convo ? usableFrames(convo) : null;
  } catch {
    return null;
  }
}
