// scripts.ts — what each demo persona actually does: the asks they type and the features they
// touch. The asks here are the single source the corpus baker (scripts/build-demo-corpus.mts)
// runs through the real turn pipeline, so a script edit means a re-bake (`ONLY=<persona>`).
//
// The honesty rule, applied to every ask: it must be (a) publicly answerable, (b) pure math on
// numbers the persona STATES in the ask, or (c) planning/advice. The model is never asked to
// conjure someone's private data — a CFO demo works because Renata gives her figures in the
// ask, not because the model invents a company. That is what lets the landing say "real
// session" without an asterisk.
import type { DemoBeat } from './beats';

export interface DemoStep {
  /** The line the persona "says" — typed into the real composer, stamped as the frame's
   *  question, shown in the rail. Absent on a FEATURE step (beats over the current canvas,
   *  no new turn, no baked frame). */
  ask?: string;
  /** Optional verbose prompt actually sent at bake time when the punchy `ask` needs more
   *  steering. History records what the model really saw; the frame shows `ask`. */
  bakeAsk?: string;
  /** This turn arrives by pressing a follow-up chip instead of typing. The driver only
   *  presses when the previous frame really carries a chip with this exact label (checked at
   *  runtime and at bake) — otherwise it falls back to typing, never a mislabeled press. */
  viaChip?: boolean;
  /** Feature choreography fired after this step's reveal walk settles. */
  beats?: DemoBeat[];
  /** One-line caption shown when the first beat fires. No voice — the answer already spoke. */
  note?: string;
  /** Minimum hold (ms) after the step settles before auto-advance. Feature steps set this
   *  explicitly; turn steps default to a short breath. */
  holdMs?: number;
  /** Bake-time expectations, checked by the baker and the corpus test — a ✗ means re-roll. */
  expect?: { minBlocks?: number; bend?: boolean; suggests?: boolean };
}

export interface DemoScript {
  persona: string;
  steps: DemoStep[];
}

export const DEMO_SCRIPTS: readonly DemoScript[] = [
  {
    // Renata's quarter: she states every figure herself; the model builds and projects.
    persona: 'cfo',
    steps: [
      {
        ask: 'Run my quarterly review: ARR grew from $12.4M to $15.1M, churn ticked up from 2.1% to 2.8%, and regions came in at NA $8.2M, EMEA $4.6M, APAC $2.3M.',
        bakeAsk:
          'Run my quarterly review: ARR grew from $12.4M to $15.1M, churn ticked up from 2.1% to 2.8%, and regions came in at NA $8.2M, EMEA $4.6M, APAC $2.3M. Build the full picture, including growth, the churn drift, and how the regions stack up.',
        expect: { minBlocks: 4, suggests: true },
      },
      {
        ask: 'Walk me through the bridge: new business added $1.9M, expansion $1.3M, and churn gave back $0.5M.',
        beats: [{ kind: 'pin', atMs: 900 }],
        note: 'Renata pins the bridge. The next question uses that context.',
        expect: { minBlocks: 2, suggests: true },
      },
      {
        // Arrives as a chip press when the previous turn really offers this chip (it reliably
        // does for this content); otherwise it types — never a mislabeled press. A follow-up
        // merges into the same canvas (augment), and merged turns can't carry a bend dial —
        // the dial showcase lives in Maya's savings turn, which opens a fresh canvas.
        ask: 'Forecast for next quarter',
        bakeAsk:
          'Forecast for next quarter: if churn keeps drifting at this pace, where does ARR land? Model it from the numbers we established.',
        viaChip: true,
        expect: { minBlocks: 2 },
      },
      {
        beats: [{ kind: 'export', atMs: 500, format: 'presentation' }],
        note: 'One tap: the whole review becomes a board deck.',
        holdMs: 6500,
      },
      {
        beats: [{ kind: 'dashboard', atMs: 500, settings: true }],
        note: 'A living dashboard keeps a board like this up to date.',
        holdMs: 6500,
      },
      {
        beats: [{ kind: 'present', atMs: 500 }],
        note: '…or presents itself, full screen.',
        holdMs: 6000,
      },
    ],
  },
  {
    // Maya's exam cram: a worked example she can bend, the concept behind it, a kept card.
    // The dial leads because a bend only survives a REPLACE turn (merges renumber block ids,
    // so settleTurn drops it) — and a session's turn 1 is the one guaranteed replace.
    persona: 'student',
    steps: [
      {
        ask: 'What does saving $200 a month at 5% become after 10 years?',
        bakeAsk:
          'What does saving $200 a month at 5% interest become after 10 years? Chart it year by year, split what I put in from what the interest earned, and make the monthly amount adjustable.',
        beats: [{ kind: 'bend', atMs: 1100 }],
        note: 'Grab the dial. The whole answer updates live.',
        expect: { minBlocks: 3, bend: true, suggests: true },
      },
      {
        ask: "Why does compound interest beat simple interest? It's on my econ exam.",
        beats: [{ kind: 'pen', atMs: 1400 }],
        note: 'Mavéa’s Pen marks the exact part Maya is studying.',
        expect: { minBlocks: 2 },
      },
      {
        beats: [{ kind: 'flashcards', atMs: 600 }],
        note: 'Any card can become a flashcard and join her study deck.',
        holdMs: 6000,
      },
    ],
  },
  {
    // Devon's architecture session: mechanisms drawn out, then the surface's power tools.
    persona: 'dev',
    steps: [
      {
        ask: "Explain how OAuth login works, step by step. I'm adding it to our app.",
        beats: [{ kind: 'focus', atMs: 1200, walk: true }],
        note: 'Focus mode: one card at a time, everything else dims.',
        expect: { minBlocks: 3, suggests: true },
      },
      {
        ask: 'Compare session cookies and JWTs for keeping users signed in. Focus on tradeoffs, not dogma.',
        bakeAsk:
          'Compare session cookies and JWTs for keeping users signed in. Show the real tradeoffs side by side, including revocation, statelessness, size, XSS and CSRF exposure, and when each wins.',
        beats: [{ kind: 'pin', atMs: 1000 }],
        expect: { minBlocks: 2 },
      },
      {
        beats: [{ kind: 'palette', atMs: 600 }],
        note: 'Press Command K. Every feature is a keystroke away.',
        holdMs: 5000,
      },
      {
        beats: [{ kind: 'export', atMs: 500, format: 'presentation' }],
        note: 'The whole session becomes a polished presentation.',
        holdMs: 7500,
      },
    ],
  },
  {
    // Lena's Lisbon weekend: the trip, the day trip, the printout for the plane.
    persona: 'traveler',
    steps: [
      {
        ask: 'Plan a long weekend in Lisbon. Three days, first visit, and we love food and views.',
        expect: { minBlocks: 4, suggests: true },
      },
      {
        ask: 'How do we plan a great day trip to Sintra on Saturday?',
        beats: [{ kind: 'canvas', atMs: 1000 }],
        note: 'The spatial canvas: the whole trip on one board.',
        expect: { minBlocks: 2 },
      },
      {
        beats: [{ kind: 'export', atMs: 500, format: 'document' }],
        note: 'The plan is ready to print for the plane.',
        holdMs: 7500,
      },
    ],
  },
];

const BY_PERSONA = new Map(DEMO_SCRIPTS.map((s) => [s.persona, s]));

export function demoScript(persona: string): DemoScript | undefined {
  return BY_PERSONA.get(persona);
}

/** The steps that are real turns (they carry an ask and consume a baked frame), in order. */
export function turnSteps(script: DemoScript): (DemoStep & { ask: string })[] {
  return script.steps.filter((s): s is DemoStep & { ask: string } => !!s.ask);
}
