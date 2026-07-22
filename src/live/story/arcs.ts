// arcs.ts — the narrative shape of an answer.
//
// A great answer isn't a pile of fitting cards; it's a STORY: it opens with the point, builds
// tension where the question is genuinely hard, and lands on what to do. This library names a
// small set of arcs and picks one from the cheap intent signals (see ../select/intent), then
// hands the planner a single directive describing how to ORDER the canvas. The model still
// chooses the components; the arc only shapes their sequence — so a decision answer opens with
// a verdict and ends on an action, a troubleshooting answer leads with the likely cause.
//
// Deliberately a SMALL set: an arc earns its place only if it changes the ordering meaningfully.
// A lean ask uses `simple_answer` (no directive — today's behavior). Pure data, no I/O.
import type { IntentSignals } from '../select/intent';
import type { AskComplexity } from '../select/complexity';

export type ArcId =
  | 'simple_answer'
  | 'high_stakes_decision'
  | 'compare_and_decide'
  | 'evaluate_risk'
  | 'parallel_futures'
  | 'plan_and_execute'
  | 'diagnose_and_fix'
  | 'learn_step_by_step'
  | 'explore_options'
  | 'personal_reflection'
  | 'explain';

export interface Arc {
  id: ArcId;
  /** The narrative-ordering instruction handed to the planner ('' for simple_answer). */
  directive: string;
}

const DIRECTIVE: Record<ArcId, string> = {
  simple_answer: '',
  high_stakes_decision:
    'STRUCTURE THIS AS A HIGH-STAKES DECISION: open with an honest verdict (a clear recommendation + the one caveat), then the real tradeoffs, then the concrete risks WITH how to reduce each, then the best / likely / worst outcomes, and END with the specific things to validate or do before committing. Stay grounded and trustworthy — no false precision, no playful framing.',
  compare_and_decide:
    'STRUCTURE THIS AS A DECISION: open with the recommendation (the verdict), then the criteria that actually matter, then a side-by-side comparison of the options, then the key tradeoffs, and END with the concrete next step.',
  parallel_futures:
    'STRUCTURE THIS AS PARALLEL FUTURES: open with the fork in one line (the decision that splits the timelines), then TWO or THREE clearly-labeled futures — give each path its own block with the eyebrow "FUTURE A — <path>", "FUTURE B — <path>" (and C only if a real third exists), each carrying that path\'s own honest numbers and consequences over time — then one side-by-side of where the paths most diverge, and END with the date or trigger by which the choice actually has to be made. Real figures only; where the future is genuinely uncertain, say so qualitatively instead of inventing precision.',
  evaluate_risk:
    'STRUCTURE THIS AS A RISK ASSESSMENT: open with the overall risk level (qualitative), break down each risk with its severity and a mitigation, then what to watch for, and END with the safeguards to put in place. Never invent a precise probability.',
  plan_and_execute:
    'STRUCTURE THIS AS A PLAN: open with the goal and the single thing that matters most, then the phased plan over time (a timeline or stepper), then the milestones, and END with the immediate first steps to take now.',
  diagnose_and_fix:
    'STRUCTURE THIS AS A DIAGNOSIS: open with the most likely cause, then the checks to run in order, then the fixes ranked by likelihood of working, and END with when to escalate or get help.',
  learn_step_by_step:
    'STRUCTURE THIS AS A LESSON: open with the core idea in one line, build understanding step by step with a concrete worked example, then the common pitfalls, and END with a quick check or what to practice next.',
  explore_options:
    'STRUCTURE THIS AS AN EXPLORATION: open with the landscape, then the distinct options as browsable cards, then what each is best for, and END with how to narrow it down. This may be more playful and visual.',
  personal_reflection:
    'STRUCTURE THIS AS A GENTLE REFLECTION: open with a grounding, non-judgmental frame (a pattern matters more than one bad day), then the signals to look at — qualitative, never scored or gamified — then a few honest prompts to reflect on, and END with one small, kind next step. Handle with care.',
  explain:
    'STRUCTURE THIS AS AN EXPLANATION: open with the essence in a line, then the how and why with a concrete example or visual, then the nuances that matter, and END with where this actually applies.',
};

const arcOf = (id: ArcId): Arc => ({ id, directive: DIRECTIVE[id] });

/**
 * Pick the arc for a turn from intent + complexity. Priority order matters: the most specific,
 * highest-stakes framing wins, so a heavy life decision is never flattened into a generic
 * explainer. A trivial ask is always `simple_answer` (today's lean behavior, no directive).
 */
export function chooseArc(intent: IntentSignals, complexity: AskComplexity): Arc {
  // An explicitly brief ask takes the simple arc too — no multi-act narrative for a tight reply.
  if (complexity === 'lean' || complexity === 'brief') return arcOf('simple_answer');

  // Care first: a personal/serious reflection that isn't itself a clear decision.
  if (intent.reflection && !intent.decision) return arcOf('personal_reflection');
  if (intent.troubleshoot) return arcOf('diagnose_and_fix');
  // A fork the user wants to walk down both sides of — before the generic decision arcs,
  // so "what happens if I stay vs take it" becomes timelines, not a flattened verdict.
  if (intent.whatIf && (intent.decision || intent.comparison || intent.planning))
    return arcOf('parallel_futures');
  if (intent.decision && intent.highStakes) return arcOf('high_stakes_decision');
  if (intent.decision || intent.comparison) return arcOf('compare_and_decide');
  if (intent.risk) return arcOf('evaluate_risk');
  if (intent.planning) return arcOf('plan_and_execute');
  if (intent.creative) return arcOf('explore_options');
  if (intent.learning) return arcOf('learn_step_by_step');
  // Default rich arc: a clean explanation.
  return arcOf('explain');
}
