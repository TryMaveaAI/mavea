// scripts.ts — what each demo persona actually does: the asks they type and the features they
// touch. The asks here are the single source the corpus baker (scripts/build-demo-corpus.mts)
// runs through the real turn pipeline, so a script edit means a re-bake (`ONLY=<persona>`).
//
// The honesty rule, applied to every ask: it must be (a) publicly answerable, (b) pure math on
// numbers the persona STATES in the ask, or (c) planning/advice. The model is never asked to
// conjure someone's private data — Renata's review works because she gives her figures in the
// ask, not because the model invents a company. The UI still labels each replay as a curated,
// fictional example because feature choreography and baked model output are not a live result.
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
  /** The view every step re-asserts. Two sessions are written for the desk (the "Guide me"
   *  walk, where the Study's connect and pen gestures live) and two for the board, so the four
   *  together show both ways Mavéa answers rather than one surface four times. */
  view: 'board' | 'study';
  steps: DemoStep[];
}

export const DEMO_SCRIPTS: readonly DemoScript[] = [
  {
    // Renata's quarter: she states every figure herself; the model builds and projects.
    persona: 'pm',
    view: 'study',
    steps: [
      {
        ask: 'Run my quarterly product review: weekly active users grew from 84k to 112k, activation slipped from 41% to 36%, and 30-day retention held at 58%. Feature adoption came in at search 71%, sharing 44%, and the new dashboard 18%.',
        bakeAsk:
          'Run my quarterly product review: weekly active users grew from 84k to 112k, activation slipped from 41% to 36%, and 30-day retention held at 58%. Feature adoption came in at search 71%, sharing 44%, and the new dashboard 18%. Build the full picture, including growth, the activation slip, retention, and how the features stack up on adoption. Work only from these figures: do not guess at causes we have not measured.',
        beats: [{ kind: 'study', atMs: 650, connect: 2 }],
        note: 'One question becomes a study. Renata holds two objects together. Now “these” has meaning.',
        expect: { minBlocks: 4, suggests: true },
      },
      {
        ask: 'Walk me through the funnel: 60k signups, 21.6k activated, 12.5k still active after 30 days, and 3.1k on a paid plan.',
        bakeAsk:
          'Walk me through the funnel: 60k signups, 21.6k activated, 12.5k still active after 30 days, and 3.1k on a paid plan. Show the conversion at each stage and where the biggest drop is, from these numbers only, without speculating about causes we have not measured.',
        beats: [{ kind: 'pin', atMs: 900 }],
        note: 'Renata pins the funnel. The next question uses that context.',
        expect: { minBlocks: 2, suggests: true },
      },
      {
        // Arrives as a chip press when the previous turn really offers this chip; otherwise it
        // types — never a mislabeled press. A follow-up
        // merges into the same canvas (augment), and merged turns can't carry a bend dial —
        // the dial showcase lives in Maya's savings turn, which opens a fresh canvas.
        ask: 'Forecast for next quarter',
        bakeAsk:
          'Forecast for next quarter: if activation keeps slipping at this pace, where do weekly actives and paid accounts land? Model it from the numbers we established.',
        viaChip: true,
        expect: { minBlocks: 2 },
      },
      {
        beats: [{ kind: 'export', atMs: 500, format: 'presentation' }],
        note: 'One tap: the whole review becomes a leadership deck.',
        holdMs: 6500,
      },
      {
        beats: [{ kind: 'dashboard', atMs: 500, settings: true }],
        note: 'A living dashboard keeps a review like this up to date.',
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
    // Maya's exam cram: a worked example, the concept behind it, a kept card — on the desk, where
    // the pen and the connect gesture live. The worked example still bakes with its dial (a bend
    // only survives a REPLACE turn, and a session's turn 1 is the one guaranteed replace), so the
    // answer is bendable the moment she leaves the desk; the replay itself does not drag it, since
    // the desk shows one card at a time and carries no dial.
    persona: 'student',
    view: 'study',
    steps: [
      {
        ask: 'What does saving $200 a month at 5% become after 10 years?',
        bakeAsk:
          'What does saving $200 a month at 5% interest become after 10 years? Chart it year by year, split what I put in from what the interest earned, and make the monthly amount adjustable.',
        note: 'The worked example comes forward first, year by year.',
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
    view: 'board',
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
        note: 'Command K opens the feature index. Every feature is a keystroke away.',
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
    view: 'board',
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
