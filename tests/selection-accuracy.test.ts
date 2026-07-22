import { select as selectComponents } from './helpers/select';
import { describe, it, expect } from 'vitest';

import { BASE_FLOOR } from '../src/live/select/catalog';
import { catalogMeta } from '../src/canvas/blocks/catalog/lookup';
import type { Archetype } from '../src/canvas/blocks/catalog/meta';

// Does the selector reach the RIGHT visualization for a question — across many topics, not just a
// happy path? This is the offline, model-free half of the ≥90% selection-accuracy bar (R3): it runs
// a stratified battery of asks through the REAL selectComponents and checks that a component of the
// right FORM is offered (pinned into the per-turn menu) and no clearly-wrong form is forced. It
// doesn't need a live model — it measures what the selector hands the model, which is deterministic
// — so it's the standing regression gate for every selection-behavior change. A live-model judged
// run (EVAL_JUDGE) measures the rest; this locks the reach.
//
// Acceptance is a FEASIBLE SET, not an exact-match gold label: several forms can be right for one
// ask ("rank the fastest marathon times" reads equally well as a bar chart or a leaderboard), and
// scoring exact-match would punish the selector for a defensible choice. So a case names the
// archetypes it would accept and, where one specific component genuinely IS the answer (the real map
// for a location, a codeblock for code), names that too.

/** The visual FORM the ask calls for. Passing means the menu offered at least one component of one
 *  of these archetypes — or, when `expectAny` is given, at least one of those exact types. */
interface Case {
  ask: string;
  /** Stratum, so a regression can be attributed to a topic rather than to the average. */
  topic: string;
  /** Any one of these archetypes satisfies the case. */
  expectArchetype?: Archetype[];
  /** …or any one of these exact types (used where a specific component is the right answer). */
  expectAny?: string[];
  /** None of these types may be offered — a clearly-wrong form for this ask. */
  forbid?: string[];
}

const BATTERY: Case[] = [
  // ── geography / location → the REAL map, never a fabricated one ──
  { ask: 'where is the eiffel tower', topic: 'geo', expectAny: ['geomap'], forbid: ['markermap'] },
  { ask: 'show me the best ramen spots in tokyo on a map', topic: 'geo', expectAny: ['geomap'] },
  { ask: "what's near the riverwalk in chicago", topic: 'geo', expectAny: ['geomap'] },
  { ask: 'is it walking distance to downtown from union station', topic: 'geo', expectAny: ['geomap'] }, // prettier-ignore
  { ask: 'which countries border switzerland', topic: 'geo', expectArchetype: ['map', 'list', 'prose'] }, // prettier-ignore
  {
    ask: 'plot the route from portland to seattle',
    topic: 'geo',
    expectAny: ['geomap', 'maproute'],
  },

  // ── travel ──
  { ask: 'plan a three day trip to rome with the sights on a map', topic: 'travel', expectAny: ['geomap'] }, // prettier-ignore
  { ask: 'plan an hour by hour itinerary for a day in paris', topic: 'travel', expectArchetype: ['timeline'] }, // prettier-ignore
  {
    ask: 'should i take the train or fly to boston',
    topic: 'travel',
    expectArchetype: ['compare'],
  },
  { ask: 'what should i pack for a week in iceland', topic: 'travel', expectArchetype: ['list', 'steps'] }, // prettier-ignore

  // ── code ──
  { ask: 'show me the python code for quicksort', topic: 'code', expectArchetype: ['code'] },
  { ask: 'how do i reverse a linked list in javascript', topic: 'code', expectAny: ['codeblock'] },
  { ask: 'write the sql to find duplicate rows', topic: 'code', expectArchetype: ['code'] },
  { ask: 'what changed between these two versions of the file', topic: 'code', expectArchetype: ['code'] }, // prettier-ignore
  { ask: 'explain this stack trace', topic: 'code', expectArchetype: ['code', 'prose'] },
  { ask: 'show the git branch history', topic: 'code', expectArchetype: ['code', 'timeline', 'graph', 'flow'] }, // prettier-ignore

  // ── explicit tabular ──
  { ask: 'make me a table of the planets and their masses', topic: 'tabular', expectAny: ['datatable'] }, // prettier-ignore
  { ask: 'put the quarterly revenue in a spreadsheet', topic: 'tabular', expectAny: ['datatable'] },
  { ask: 'compare these three laptops in a table', topic: 'tabular', expectArchetype: ['table', 'compare'] }, // prettier-ignore

  // ── recipes / how-to → steps ──
  {
    ask: 'give me a recipe for chocolate chip cookies',
    topic: 'cooking',
    expectAny: ['recipecard'],
  },
  { ask: 'how do i change a flat tire step by step', topic: 'howto', expectArchetype: ['steps', 'list', 'timeline'] }, // prettier-ignore
  { ask: 'how do i set up a compost bin', topic: 'howto', expectArchetype: ['steps', 'list', 'timeline'] }, // prettier-ignore
  { ask: 'walk me through filing a tax extension', topic: 'howto', expectArchetype: ['steps', 'list', 'timeline'] }, // prettier-ignore

  // ── trends over time ──
  {
    ask: 'how has bitcoin changed over the past year',
    topic: 'finance',
    expectArchetype: ['trend'],
  },
  { ask: 'plot global temperature over the last century', topic: 'science', expectArchetype: ['trend'] }, // prettier-ignore
  { ask: 'show me apple stock over the last five years', topic: 'finance', expectArchetype: ['trend'] }, // prettier-ignore
  { ask: 'has my resting heart rate improved since january', topic: 'health', expectArchetype: ['trend', 'stat'] }, // prettier-ignore

  // ── composition / breakdown ──
  { ask: 'where does my monthly budget go', topic: 'finance', expectArchetype: ['composition'] },
  { ask: 'break down the macronutrients in an avocado', topic: 'health', expectArchetype: ['composition'] }, // prettier-ignore
  { ask: 'what is the earth’s atmosphere made of', topic: 'science', expectArchetype: ['composition'] }, // prettier-ignore
  { ask: 'how is the federal budget allocated', topic: 'finance', expectArchetype: ['composition', 'tree'] }, // prettier-ignore

  // ── comparison / decision ──
  { ask: 'compare the iphone 15 and the pixel 8', topic: 'tech', expectArchetype: ['compare'] },
  {
    ask: "what's the best budget laptop",
    topic: 'tech',
    expectArchetype: ['compare', 'bar', 'table'],
  },
  { ask: 'rent or buy a house in this market', topic: 'finance', expectArchetype: ['compare'] },
  { ask: 'react vs svelte for a new project', topic: 'tech', expectArchetype: ['compare'] },

  // ── ranking / leaderboard ──
  { ask: 'rank the top 5 fastest marathon times', topic: 'sports', expectArchetype: ['bar', 'table', 'compare'] }, // prettier-ignore
  { ask: 'which countries have the largest populations', topic: 'reference', expectArchetype: ['bar', 'table', 'compare'] }, // prettier-ignore
  {
    ask: 'top grossing films of all time',
    topic: 'media',
    expectArchetype: ['bar', 'table', 'compare'],
  },

  // ── timeline / sequence ──
  { ask: 'give me a timeline of world war 2', topic: 'history', expectArchetype: ['timeline'] },
  { ask: 'what happened during the apollo program', topic: 'history', expectArchetype: ['timeline', 'prose'] }, // prettier-ignore
  { ask: 'show the project schedule with dependencies', topic: 'business', expectArchetype: ['timeline', 'flow'] }, // prettier-ignore

  // ── a single key figure ──
  {
    ask: 'what is the population of japan',
    topic: 'reference',
    expectArchetype: ['stat', 'prose'],
  },
  { ask: 'how far is the moon', topic: 'science', expectArchetype: ['stat', 'prose'] },
  { ask: 'what is 17 percent of 340', topic: 'reference', expectArchetype: ['stat', 'prose'] },

  // ── status / progress ──
  {
    ask: 'how close am i to my savings goal of 10000',
    topic: 'finance',
    expectArchetype: ['stat'],
  },
  { ask: 'how much of the sprint is done', topic: 'business', expectArchetype: ['stat', 'bar'] },

  // ── distribution ──
  { ask: 'show the distribution of household incomes', topic: 'reference', expectArchetype: ['distribution', 'bar'] }, // prettier-ignore
  { ask: 'what does the spread of response times look like', topic: 'tech', expectArchetype: ['distribution', 'trend'] }, // prettier-ignore

  // ── correlation / relationship ──
  { ask: 'is there a correlation between sleep and productivity', topic: 'science', expectArchetype: ['scatter', 'matrix', 'trend'] }, // prettier-ignore
  { ask: 'how does price affect demand', topic: 'business', expectArchetype: ['scatter', 'trend'] },

  // ── process / flow ──
  { ask: 'explain the process and feedback loop as a state machine diagram', topic: 'science', expectAny: ['diagramflow'] }, // prettier-ignore
  { ask: 'draw a flowchart of the water cycle', topic: 'science', expectArchetype: ['graph', 'flow', 'timeline', 'steps'] }, // prettier-ignore
  { ask: 'where do users drop off in our signup funnel', topic: 'business', expectArchetype: ['flow'] }, // prettier-ignore
  { ask: 'how does a bill become a law', topic: 'civics', expectArchetype: ['flow', 'graph', 'steps', 'timeline'] }, // prettier-ignore

  // ── hierarchy / tree ──
  { ask: 'show the org chart for a startup', topic: 'business', expectArchetype: ['tree', 'graph', 'flow'] }, // prettier-ignore
  { ask: 'break 360 into its prime factors', topic: 'math', expectArchetype: ['tree', 'composition', 'prose'] }, // prettier-ignore
  { ask: 'what is the taxonomy of the great white shark', topic: 'science', expectArchetype: ['tree', 'list', 'prose'] }, // prettier-ignore

  // ── health / fitness domain specialists ──
  { ask: 'build me a weekly workout plan', topic: 'fitness', expectAny: ['workoutplan'] },
  { ask: 'when should i take my medication', topic: 'health', expectAny: ['medicationschedule'] },
  {
    ask: 'am i drinking enough water each day',
    topic: 'health',
    expectArchetype: ['stat', 'trend'],
  },

  // ── media ──
  { ask: 'show me photos of the northern lights', topic: 'media', expectAny: ['gallery'] },
  { ask: 'what does a monarch butterfly look like', topic: 'media', expectArchetype: ['media', 'prose'] }, // prettier-ignore

  // ── documents ──
  { ask: 'show me the bitcoin whitepaper', topic: 'reference', expectArchetype: ['document'] },
  { ask: 'open the annual report pdf', topic: 'business', expectArchetype: ['document'] },

  // ── learning ──
  { ask: 'quiz me on state capitals', topic: 'education', expectAny: ['quiz'] },
  { ask: 'make flashcards for spanish verbs', topic: 'education', expectAny: ['flashcard'] },
  { ask: 'teach me how photosynthesis works', topic: 'education', expectArchetype: ['prose', 'steps', 'flow', 'graph', 'scatter', 'timeline'] }, // prettier-ignore
  {
    ask: 'conjugate the verb hablar',
    topic: 'language',
    expectArchetype: ['table', 'list', 'prose'],
  },

  // ── definition / reference ──
  { ask: 'what does ephemeral mean', topic: 'reference', expectAny: ['dictionary', 'insight'] },
  { ask: 'explain quantum entanglement simply', topic: 'science', expectArchetype: ['prose', 'scatter', 'canvas'] }, // prettier-ignore

  // ── chemistry / physics specialists ──
  { ask: 'show me the structure of caffeine', topic: 'science', expectArchetype: ['canvas', 'scatter', 'media'] }, // prettier-ignore
  { ask: 'draw the free body diagram for a block on a ramp', topic: 'science', expectArchetype: ['canvas', 'scatter'] }, // prettier-ignore
  { ask: 'graph y equals x squared minus 4', topic: 'math', expectArchetype: ['trend', 'scatter', 'canvas'] }, // prettier-ignore

  // ── music ──
  { ask: 'what are the chords for wonderwall', topic: 'music', expectArchetype: ['canvas', 'list', 'prose', 'media'] }, // prettier-ignore

  // ── everyday / reflective (vague-but-purposeful) ──
  { ask: 'should i take the job offer', topic: 'decision', expectArchetype: ['compare', 'prose', 'list'] }, // prettier-ignore
  { ask: 'is this friendship draining me', topic: 'reflection', expectArchetype: ['prose', 'list', 'compare'] }, // prettier-ignore
  {
    ask: 'help me plan my week',
    topic: 'planning',
    expectArchetype: ['timeline', 'list', 'steps'],
  },
];

/** Every archetype the offered menu can render. */
function offeredArchetypes(types: readonly string[]): Set<Archetype> {
  const out = new Set<Archetype>();
  for (const t of types) {
    const meta = catalogMeta(t);
    if (meta) out.add(meta.archetype);
  }
  return out;
}

/** The archetypes the always-merged base floor already covers. A case whose feasible set contains
 *  one of these is satisfied no matter what the selector retrieves, so it proves nothing about
 *  RETRIEVAL — it only proves the floor exists. The DEMANDING cases are the ones that need a form
 *  the floor cannot produce (a real map, a code block, a table, a document, a distribution…), and
 *  those are scored separately below so the headline number can never be propped up by the floor. */
const FLOOR_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>([
  'prose',
  'trend',
  'composition',
  'list',
  'timeline',
  'compare',
  'stat',
]);

/** True when passing this case REQUIRES the selector to retrieve something beyond the base floor —
 *  neither a floor archetype nor a floor component may satisfy it. */
function isDemanding(c: Case): boolean {
  const archOk = (c.expectArchetype ?? []).every((a) => !FLOOR_ARCHETYPES.has(a));
  const typeOk = (c.expectAny ?? []).every((t) => !BASE_FLOOR.includes(t));
  if (c.expectAny && c.expectArchetype) return archOk && typeOk;
  return c.expectAny ? typeOk : archOk;
}

const results = BATTERY.map((c) => {
  const { types } = selectComponents({ userText: c.ask, tier: 'frontier' });
  const offered = new Set(types);
  const archetypes = offeredArchetypes(types);
  const byType = c.expectAny ? c.expectAny.some((t) => offered.has(t)) : false;
  const byArch = c.expectArchetype ? c.expectArchetype.some((a) => archetypes.has(a)) : false;
  const reached = byType || byArch;
  const forbidden = (c.forbid ?? []).filter((t) => offered.has(t));
  return { ...c, offered, archetypes, reached, forbidden, pass: reached && !forbidden.length };
});

describe('selection accuracy — the right form is reached across many topics', () => {
  for (const r of results) {
    it(`[${r.topic}] ${r.ask}`, () => {
      const want = r.expectAny
        ? `type ∈ [${r.expectAny.join(', ')}]`
        : `archetype ∈ [${(r.expectArchetype ?? []).join(', ')}]`;
      expect(
        r.reached,
        `expected ${want} for "${r.ask}" — offered archetypes: ${[...r.archetypes].sort().join(', ')}`,
      ).toBe(true);
      expect(r.forbidden, `forbidden form(s) offered for "${r.ask}"`).toEqual([]);
    });
  }

  it('overall selection accuracy across topics is ≥ 90%', () => {
    const passed = results.filter((r) => r.pass).length;
    const rate = passed / results.length;
    const failures = results.filter((r) => !r.pass).map((r) => `[${r.topic}] ${r.ask}`);
    expect(
      rate,
      `selection accuracy ${(rate * 100).toFixed(1)}% of ${results.length} cases (< 90%); misses:\n  ${failures.join('\n  ')}`,
    ).toBeGreaterThanOrEqual(0.9);
  });

  it('the DEMANDING cases — those the base floor cannot satisfy — are ≥ 90%', () => {
    // The real measure of retrieval. If this ever passes only because the floor is always merged in,
    // the selector has stopped retrieving and nobody would notice from the headline number.
    const hard = results.filter((r) => isDemanding(r));
    expect(hard.length, 'the battery must keep a substantial demanding subset').toBeGreaterThan(25);
    const passed = hard.filter((r) => r.pass).length;
    const rate = passed / hard.length;
    const failures = hard.filter((r) => !r.pass).map((r) => `[${r.topic}] ${r.ask}`);
    expect(
      rate,
      `demanding-case accuracy ${(rate * 100).toFixed(1)}% of ${hard.length} (< 90%); misses:\n  ${failures.join('\n  ')}`,
    ).toBeGreaterThanOrEqual(0.9);
  });

  it('no single topic collapses — every stratum is ≥ 50% (a whole subject never goes dark)', () => {
    const strata = new Map<string, { n: number; ok: number }>();
    for (const r of results) {
      const s = strata.get(r.topic) ?? { n: 0, ok: 0 };
      s.n += 1;
      if (r.pass) s.ok += 1;
      strata.set(r.topic, s);
    }
    const collapsed = [...strata]
      .filter(([, s]) => s.ok / s.n < 0.5)
      .map(([t, s]) => `${t} (${s.ok}/${s.n})`);
    expect(collapsed, `topic strata below 50%: ${collapsed.join(', ')}`).toEqual([]);
  });
});

describe('attachment signal — uploads steer selection to the right base', () => {
  it('pins a datatable when a spreadsheet / CSV is attached', () => {
    const r = selectComponents({
      userText: 'summarize this',
      tier: 'frontier',
      attachments: [{ kind: 'sheet', name: 'q3-revenue.csv' }],
    });
    expect(r.types).toContain('datatable');
  });

  it('pins a datatable for a receipt image the user wants itemized', () => {
    const r = selectComponents({
      userText: 'break down this receipt into line items',
      tier: 'frontier',
      attachments: [{ kind: 'image', name: 'receipt.jpg' }],
    });
    expect(r.types).toContain('datatable');
  });

  it('does NOT force a datatable for a plain image with no tabular intent', () => {
    const r = selectComponents({
      userText: 'what breed of dog is this',
      tier: 'frontier',
      attachments: [{ kind: 'image', name: 'dog.jpg' }],
    });
    expect(r.types).not.toContain('datatable');
  });
});
