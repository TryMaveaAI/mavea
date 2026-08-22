// authoredExamples.ts — worked example props for block types that aren't exercised in the
// demo conversations, so they can still be made Live-available: the menu shows the model the
// exact shape to fill, and the example gauntlet (tests/live-examples.test.ts) verifies each one
// coerces into a renderable block. Demo-sourced examples (examples.ts) win when both exist —
// they're real shipping data and can't drift. Keep each entry a COMPLETE, realistic props
// object (every required field + a couple of optional ones), matching the component's renderer.
//
// The entries are split by domain into examples.<domain>.ts modules for readability; this file
// re-assembles them into the single AUTHORED_EXAMPLES object callers import. The spreads run in
// the same order the entries appeared originally, so the merged object has identical keys, values,
// and key order — the split is a pure reorganization with no behavior change.
import { DOCUMENT_EXAMPLES } from './examples.documents';
import { REASONING_EXAMPLES } from './examples.reasoning';
import { MEDIA_EXAMPLES } from './examples.media';
import { LANGUAGE_EXAMPLES } from './examples.language';
import { CODE_EXAMPLES } from './examples.code';
import { EVERYDAY_EXAMPLES } from './examples.everyday';
import { DATA_EXAMPLES } from './examples.data';
import { STRUCTURE_EXAMPLES } from './examples.structure';
import { PLANNING_EXAMPLES } from './examples.planning';
import { COVERAGE_EXAMPLES } from './examples.coverage';
import { APPLIED_EXAMPLES } from './examples.applied';

export const AUTHORED_EXAMPLES: Record<string, Record<string, unknown>> = {
  ...DOCUMENT_EXAMPLES,
  ...REASONING_EXAMPLES,
  ...MEDIA_EXAMPLES,
  ...LANGUAGE_EXAMPLES,
  ...CODE_EXAMPLES,
  ...EVERYDAY_EXAMPLES,
  ...DATA_EXAMPLES,
  ...STRUCTURE_EXAMPLES,
  ...PLANNING_EXAMPLES,

  // ── new domain-coverage components ──────────────────────────────────────

  ...COVERAGE_EXAMPLES,
  ...APPLIED_EXAMPLES,
};
