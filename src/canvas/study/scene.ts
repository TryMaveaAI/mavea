import type { Block } from '../../data/conversation';
import { defaultHeroId } from '../focus/heroSelect';

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
  parked: StudyActor[];
  intensity: StudyIntensity;
}

const NEAR_CAP = 4;

function intensityFor(count: number): StudyIntensity {
  if (count <= 2) return 'quiet';
  if (count <= 5) return 'guided';
  return 'immersive';
}

/**
 * Builds the study from answer order, the current conversational focus, and reversible local parks.
 * The active object's neighbors alternate forward/backward around it, keeping related evidence
 * close without making placement depend on a particular demo's card count.
 */
export function deriveStudyScene(
  blocks: readonly Block[],
  activeId: string | null,
  parkedIds: ReadonlySet<string>,
  prioritizedIds: ReadonlySet<string> = new Set(),
): StudyScene {
  const eligible = blocks
    .map((block, sourceIndex) => ({ block, sourceIndex }))
    .filter((entry): entry is { block: Block & { id: string }; sourceIndex: number } =>
      Boolean(entry.block.id),
    );

  const parkedEntries = eligible.filter(({ block }) => parkedIds.has(block.id));
  const visible = eligible.filter(({ block }) => !parkedIds.has(block.id));
  const fallbackId = defaultHeroId(visible.map(({ block }) => block));
  const resolvedId = visible.some(({ block }) => block.id === activeId) ? activeId : fallbackId;
  const activeIndex = Math.max(
    0,
    visible.findIndex(({ block }) => block.id === resolvedId),
  );
  const activeEntry = visible[activeIndex];

  if (!activeEntry) {
    return {
      active: null,
      nearby: [],
      horizon: [],
      parked: parkedEntries.map(({ block, sourceIndex }, slot) => ({
        block,
        id: block.id,
        sourceIndex,
        zone: 'horizon',
        slot,
      })),
      intensity: 'quiet',
    };
  }

  const proximityOrder: typeof visible = [];
  for (let distance = 1; proximityOrder.length < visible.length - 1; distance += 1) {
    const after = activeIndex + distance;
    const before = activeIndex - distance;
    if (after < visible.length) proximityOrder.push(visible[after]);
    if (before >= 0) proximityOrder.push(visible[before]);
  }

  const actor = (entry: (typeof visible)[number], zone: StudyZone, slot: number): StudyActor => ({
    block: entry.block,
    id: entry.block.id,
    sourceIndex: entry.sourceIndex,
    zone,
    slot,
  });
  const prioritized = proximityOrder.filter(({ block }) => prioritizedIds.has(block.id));
  const ordinary = proximityOrder.filter(({ block }) => !prioritizedIds.has(block.id));
  const attentionOrder = [...prioritized, ...ordinary];
  const nearbyEntries = attentionOrder.slice(0, NEAR_CAP);
  // The horizon may scroll, but it must never truncate the answer. Provider output is dynamic and
  // a silent cap would make later objects impossible to recover in any Study interaction.
  const horizonEntries = attentionOrder.slice(NEAR_CAP);

  return {
    active: actor(activeEntry, 'foreground', 0),
    nearby: nearbyEntries.map((entry, slot) => actor(entry, 'near', slot)),
    horizon: horizonEntries.map((entry, slot) => actor(entry, 'horizon', slot)),
    parked: parkedEntries.map((entry, slot) => actor(entry, 'horizon', slot)),
    intensity: intensityFor(visible.length),
  };
}
