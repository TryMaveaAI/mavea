// world/scenarios/index.ts — the whole scenario corpus in one place: the sixteen shipped worlds
// (world/scenarios.ts) plus the four authored batches that surround them, so the gauntlet sweeps
// ONE list and a new batch reaches every invariant by being added here.
//
// Resolution note, because the two names look identical and are not: `../scenarios` is the FILE
// `world/scenarios.ts`, while `./scenarios/index` (this file) is the directory. Node and bundler
// resolution both try the extension before the directory, so every existing importer of
// `'./scenarios'` keeps getting the original module untouched — this file is additive, and reaching
// the aggregate is an explicit `scenarios/index` import.
import { WORLD_SCENARIOS, type WorldScenario } from '../scenarios';
import { EDGE_CASE_SCENARIOS } from './edgeCases';
import { NATURAL_SCIENCE_SCENARIOS } from './naturalScience';
import { SOCIETY_ECONOMY_SCENARIOS } from './societyEconomy';
import { TECH_HISTORY_SCENARIOS } from './techHistory';

export type { WorldScenario };
/** Re-exported so a sweep needs one import: the corpus and the corpus's own grounding text. */
export { worldCorpus } from '../scenarios';

/** Each batch under the name a failure should report it by. Ordered cheapest-first, matching the
 *  shipped corpus's own convention: a red two-node world is far easier to read than a red 61-node
 *  one, and when a defect hits both they fail together. */
export const SCENARIO_BATCHES: ReadonlyArray<{
  name: string;
  scenarios: readonly WorldScenario[];
}> = [
  { name: 'shipped', scenarios: WORLD_SCENARIOS },
  { name: 'edge-cases', scenarios: EDGE_CASE_SCENARIOS },
  { name: 'natural-science', scenarios: NATURAL_SCIENCE_SCENARIOS },
  { name: 'society-economy', scenarios: SOCIETY_ECONOMY_SCENARIOS },
  { name: 'tech-history', scenarios: TECH_HISTORY_SCENARIOS },
];

/** Every scenario, in batch order, before de-duplication — what `duplicateScenarioIds` inspects. */
const CONCATENATED: readonly WorldScenario[] = SCENARIO_BATCHES.flatMap((b) => b.scenarios);

/**
 * Ids that appear in more than one batch, each reported once with the batches that claim it.
 * De-duplication below is a safety net, not a licence: a collision means two authors are describing
 * different worlds under one name, and the sweep asserts this list is empty rather than letting the
 * loser vanish silently.
 */
export function duplicateScenarioIds(): readonly string[] {
  const owners = new Map<string, string[]>();
  for (const batch of SCENARIO_BATCHES) {
    for (const s of batch.scenarios) {
      const seen = owners.get(s.id);
      if (seen) seen.push(batch.name);
      else owners.set(s.id, [batch.name]);
    }
  }
  return [...owners]
    .filter(([, batches]) => batches.length > 1)
    .map(([id, batches]) => `${id} (${batches.join(', ')})`);
}

/** The full corpus, de-duplicated by id with the first claimant winning. */
export const ALL_WORLD_SCENARIOS: readonly WorldScenario[] = (() => {
  const byId = new Map<string, WorldScenario>();
  for (const s of CONCATENATED) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()];
})();

/** Look one up by id — a dev lab route and a failing sweep both want this rather than an index. */
export function allWorldScenario(id: string): WorldScenario | undefined {
  return ALL_WORLD_SCENARIOS.find((s) => s.id === id);
}
