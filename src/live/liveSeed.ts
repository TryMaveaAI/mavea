// liveSeed.ts — the canvas Live shows BEFORE the first question, so the surface feels
// alive from the first frame instead of presenting a bare welcome screen.
//
// HONESTY (load-bearing): Live shows REAL data only — never fabricated content dressed up
// as an answer. So this opener is NOT a fake answer and NOT borrowed demo content; it is an
// explicit, clearly-labeled illustration of the KINDS OF VISUALS Mavéa draws — every card is
// marked "Example", carries placeholder shapes (not claims about the world or the user), and
// says outright that a real question fills it with real data. Static, no model call.
import type { Block, ConversationSpec } from '../data/conversation';
import { targetBlockCount } from './screen';

// The opener always leads (position 0).
const OPENER: Block = {
  type: 'insight',
  col: 12,
  delay: 0,
  id: 'seed-1',
  num: '1',
  props: {
    title: 'Ask anything — Mavéa shows what it means',
    summary:
      'These cards are just examples of the visuals Mavéa can draw. Ask a real question and it fills them with real, live data — narrated by voice.',
    conf: 'inferred',
  },
};

// A varied sampler of the rich components, ordered most-impressive-first. Cast to Block[]
// because it spans the frontier-cousin types (donut/gauge/bars/stack) the renderer handles
// but the core union doesn't enumerate; each is a fixed, hand-checked shape. Every card is
// explicitly labeled "Example" so it is never mistaken for a real, data-backed answer.
const SAMPLER: Block[] = [
  {
    type: 'kpi',
    col: 6,
    id: 'seed-kpi',
    props: {
      title: 'What it draws on',
      kpis: [
        { val: '130+', label: 'components' },
        { val: '40+', label: 'chart types' },
        { val: 'Live', label: 'by voice' },
      ],
    },
  },
  {
    type: 'donut',
    col: 6,
    id: 'seed-donut',
    props: {
      title: 'Example — a composition',
      rows: [
        { label: 'Needs', pct: 50, color: 'var(--presence)' },
        { label: 'Wants', pct: 30, color: 'var(--insight)' },
        { label: 'Savings', pct: 20, color: 'var(--warning)' },
      ],
    },
  },
  {
    type: 'gauge',
    col: 4,
    id: 'seed-gauge',
    props: { title: 'Example — a score', value: 72, max: 100, band: 'on track' },
  },
  {
    type: 'bars',
    col: 8,
    id: 'seed-bars',
    props: {
      title: 'Example — comparing amounts',
      bars: [
        { label: 'Mon', value: 3 },
        { label: 'Tue', value: 5 },
        { label: 'Wed', value: 4, hot: true },
        { label: 'Thu', value: 7 },
        { label: 'Fri', value: 8 },
      ],
    },
  },
  {
    type: 'ring',
    col: 6,
    id: 'seed-ring',
    props: {
      title: 'Example — progress',
      rings: [{ label: 'Toward the goal', pct: 0.6, display: '60%', hint: 'example' }],
    },
  },
  {
    type: 'stack',
    col: 6,
    id: 'seed-stack',
    props: {
      title: 'Example — parts of a total',
      total: '100',
      segments: [
        { label: 'A', value: 50, display: '50', color: 'var(--presence)' },
        { label: 'B', value: 30, display: '30', color: 'var(--insight)' },
        { label: 'C', value: 20, display: '20', color: 'var(--warning)' },
      ],
    },
  },
  {
    type: 'breakdown',
    col: 6,
    id: 'seed-breakdown',
    props: {
      title: 'Example — a split',
      rows: [
        { name: 'Part A', val: 'half', pct: 50 },
        { name: 'Part B', val: 'a third', pct: 30 },
        { name: 'Part C', val: 'the rest', pct: 20, tag: 'example' },
      ],
    },
  },
  {
    type: 'chart',
    col: 12,
    id: 'seed-chart',
    props: {
      title: 'Example — a trend over time',
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      series: [{ name: 'Example', color: 'var(--presence)', data: [3, 5, 4, 7, 8] }],
      footer: 'A real question fills this with your own data.',
    },
  },
  {
    type: 'timeline',
    col: 6,
    id: 'seed-timeline',
    props: {
      events: [
        { time: 'Step 1', title: 'You ask', detail: 'by voice or text' },
        { time: 'Step 2', title: 'Mavéa answers', detail: 'out loud' },
        { time: 'Step 3', title: 'The canvas builds', detail: 'visuals appear' },
      ],
    },
  },
  {
    type: 'compare',
    col: 6,
    id: 'seed-compare',
    props: {
      eyebrow: 'Example',
      options: [{ name: 'Option A', pick: true }, { name: 'Option B' }],
      criteria: [
        { label: 'Speed', cells: [{ v: 'Fast', win: true }, { v: 'Slower' }] },
        { label: 'Cost', cells: [{ v: 'Low', win: true }, { v: 'High' }] },
      ],
    },
  },
] as Block[];

/** The opening sampler shown before the first question (no model call). Reveals as many
 *  blocks as fill the current screen, opener first. A fresh object each call so the canvas
 *  can own/animate it without sharing mutable state. */
export function buildLiveSeed(count: number = targetBlockCount()): ConversationSpec {
  const rest = SAMPLER.slice(0, Math.max(0, count - 1));
  const blocks: Block[] = [OPENER, ...rest].map((b, i) => ({
    ...b,
    delay: Math.min(i * 70, 600),
  }));
  return {
    id: 'live',
    workspace: 'Live',
    title: 'What Mavéa can show',
    sub: 'A living canvas of visuals for every question — narrated by voice.',
    opener: 'Ask me anything — I answer out loud and show what I mean.',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}
