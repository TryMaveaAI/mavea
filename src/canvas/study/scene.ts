import type { Block } from '../../data/conversation';
import { defaultHeroId } from '../focus/heroSelect';
import { BACK_CAP } from './slots';

export type StudyIntensity = 'quiet' | 'guided' | 'immersive';
export type StudyZone = 'foreground' | 'near' | 'horizon';

export interface StudyActor {
  block: Block;
  id: string;
  sourceIndex: number;
  zone: StudyZone;
  slot: number;
}

export interface StudyScene {
  active: StudyActor | null;
  nearby: StudyActor[];
  horizon: StudyActor[];
  intensity: StudyIntensity;
}

function intensityFor(count: number): StudyIntensity {
  if (count <= 2) return 'quiet';
  if (count <= 5) return 'guided';
  return 'immersive';
}

/**
 * Whether an object belongs ON the desk.
 *
 * A world preview is a doorway to another surface, not something to examine: on the desk it would
 * take a slot, a beat and four notes to say "there is more elsewhere". It stays on the grid.
 *
 * This is exported because the OFFER and the DESK have to agree. They did not: `TopicCanvas`
 * counted every id-bearing block when deciding whether to offer the Study, while `StudyStage`
 * filtered worlds out — so an answer whose only addressable block was a doorway offered a Study
 * that then rendered nothing at all. Two copies of one rule is what made that possible.
 */
export function isDeskObject(block: Block): boolean {
  return block.type !== 'world';
}

/** The objects a desk built from these blocks would actually draw. */
export function deskObjects(blocks: readonly Block[]): Block[] {
  return blocks.filter(isDeskObject);
}

/**
 * Builds the study from answer order and the current conversational focus. The active object's
 * neighbors alternate forward/backward around it, keeping related evidence close without making
 * placement depend on a particular demo's card count. Nearby actors fill the desk's back arc
 * (BACK_CAP slots); everything past the arc is the horizon — always reachable through the beat
 * bar, and never truncated: provider output is dynamic and a silent cap would make later objects
 * impossible to recover in any Study interaction.
 */
export function deriveStudyScene(
  blocks: readonly Block[],
  activeId: string | null,
  prioritizedIds: ReadonlySet<string> = new Set(),
): StudyScene {
  const eligible = blocks
    .map((block, sourceIndex) => ({ block, sourceIndex }))
    .filter((entry): entry is { block: Block & { id: string }; sourceIndex: number } =>
      Boolean(entry.block.id),
    );

  const fallbackId = defaultHeroId(eligible.map(({ block }) => block));
  const resolvedId = eligible.some(({ block }) => block.id === activeId) ? activeId : fallbackId;
  const activeIndex = Math.max(
    0,
    eligible.findIndex(({ block }) => block.id === resolvedId),
  );
  const activeEntry = eligible[activeIndex];

  if (!activeEntry) {
    return { active: null, nearby: [], horizon: [], intensity: 'quiet' };
  }

  const proximityOrder: typeof eligible = [];
  for (let distance = 1; proximityOrder.length < eligible.length - 1; distance += 1) {
    const after = activeIndex + distance;
    const before = activeIndex - distance;
    if (after < eligible.length) proximityOrder.push(eligible[after]);
    if (before >= 0) proximityOrder.push(eligible[before]);
  }

  const actor = (entry: (typeof eligible)[number], zone: StudyZone, slot: number): StudyActor => ({
    block: entry.block,
    id: entry.block.id,
    sourceIndex: entry.sourceIndex,
    zone,
    slot,
  });
  const prioritized = proximityOrder.filter(({ block }) => prioritizedIds.has(block.id));
  const ordinary = proximityOrder.filter(({ block }) => !prioritizedIds.has(block.id));
  const attentionOrder = [...prioritized, ...ordinary];
  const nearbyEntries = attentionOrder.slice(0, BACK_CAP);
  const horizonEntries = attentionOrder.slice(BACK_CAP);

  return {
    active: actor(activeEntry, 'foreground', 0),
    nearby: nearbyEntries.map((entry, slot) => actor(entry, 'near', slot)),
    horizon: horizonEntries.map((entry, slot) => actor(entry, 'horizon', slot)),
    intensity: intensityFor(eligible.length),
  };
}
