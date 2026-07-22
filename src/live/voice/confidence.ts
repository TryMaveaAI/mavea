// Provenance readouts for the answer hero: how many of the canvas's claims are inferred
// rather than grounded, and which sources the answer leaned on — shown as a quiet mono row
// under the spoken line, the way an instrument labels its inputs. Pure; never throws.
import type { Block, Conf, ConversationSpec, WebSource } from '../../data/conversation';
import { hostOf } from '../../lib/sourceHost';

const SHAKY: ReadonlySet<Conf> = new Set(['inferred', 'unverified']);

function blockConf(b: Block): Conf | undefined {
  const { conf } = b.props as { conf?: unknown };
  return conf === 'strong' || conf === 'partial' || conf === 'inferred' || conf === 'unverified'
    ? conf
    : undefined;
}

/** Count blocks whose own confidence marks them inferred/unverified (composites included). */
export function inferredClaims(spec: ConversationSpec | null): number {
  if (!spec) return 0;
  let n = 0;
  const walk = (blocks: readonly Block[]): void => {
    for (const b of blocks) {
      const c = blockConf(b);
      if (c && SHAKY.has(c)) n++;
      if (b.type === 'composite') walk(b.props.regions.map((r) => r.block));
    }
  };
  walk(spec.blocks);
  return n;
}

/** Short source names for the hero's "Sources:" row — hostnames, deduped, capped. */
export function sourceNames(sources: readonly WebSource[] | undefined, max = 3): string[] {
  if (!sources?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    const name = hostOf(s.url) ?? s.title;
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}
