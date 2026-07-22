// Which block takes the Focus-mode stage when Mavéa isn't actively narrating one.
import type { Block } from '../../data/conversation';

/**
 * The resting hero: the lead insight if there is one (the engine and Live both treat the first
 * insight as the headline of an answer), otherwise the first block that carries an id — only
 * id-bearing blocks are spotlightable, so only they can hold the stage. Returns null when no
 * block is eligible (the caller then falls back to the full grid). Pure + dependency-light so
 * it's trivially unit-testable.
 */
export function defaultHeroId(blocks: readonly Block[]): string | null {
  const lead = blocks.find((b) => b.type === 'insight' && !!b.id);
  if (lead?.id) return lead.id;
  return blocks.find((b) => !!b.id)?.id ?? null;
}
