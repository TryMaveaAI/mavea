import { autoFix, checkConsistency, hasHardIssue, repairInstruction } from '../src/live/verify';
import type { LiveResponse } from '../src/engine/liveSchema';

// Locks the accuracy guardrail — the cheap checks that decide whether a turn needs
// a self-correction pass. If these mis-fire, we either repair good answers (slow)
// or pass bad ones (inaccurate).
function resp(blocks: LiveResponse['blocks']): LiveResponse {
  return { title: 't', sub: '', narration: '', blocks };
}

/** The array fields the numeric-consistency pass iterates per staple type. In production these
 *  are guaranteed by validateLiveResponse; the hand-built test blocks seed empty ones so the
 *  pass doesn't trip over a missing array while we exercise only the variety floor. */
const SAFE_PROPS: Record<string, Record<string, unknown>> = {
  kpi: { kpis: [] },
  bars: { bars: [] },
  chart: { labels: [], series: [] },
  compare: { options: [], criteria: [] },
  breakdown: { rows: [] },
  donut: { rows: [] },
  stack: { segments: [] },
  ring: { rings: [] },
};

/** A minimally-typed block of an arbitrary type. The specialization floor only reads
 *  `block.type`, so building exotic catalog types this way keeps the variety tests focused
 *  (and free of each specialized component's strict prop shape). */
function block(type: string, props: Record<string, unknown> = {}): LiveResponse['blocks'][number] {
  return {
    type,
    col: 4,
    delay: 0,
    props: { ...SAFE_PROPS[type], ...props },
  } as unknown as LiveResponse['blocks'][number];
}

/** The always-on standard dozen — used to build "all-staples" canvases that should collapse. */
const STAPLES = [
  'insight',
  'kpi',
  'timeline',
  'list',
  'compare',
  'chart',
  'bars',
  'gauge',
] as const;

describe('checkConsistency', () => {
  it('passes a clean, varied answer', () => {
    const r = resp([
      {
        type: 'insight',
        col: 4,
        delay: 0,
        id: 'live-1',
        num: '1',
        props: { title: 'a', conf: 'inferred' },
      },
      {
        type: 'breakdown',
        col: 4,
        delay: 90,
        props: {
          title: 'split',
          rows: [
            { name: 'A', val: '$50', pct: 60 },
            { name: 'B', val: '$33', pct: 40 },
          ],
        },
      },
      { type: 'list', col: 4, delay: 180, props: { title: 'Tips', items: ['one', 'two'] } },
    ]);
    expect(checkConsistency(r)).toEqual([]);
  });

  it('flags a breakdown whose shares do not add up to ~100', () => {
    const r = resp([
      {
        type: 'breakdown',
        col: 4,
        delay: 0,
        props: {
          title: 'bad',
          rows: [
            { name: 'A', val: '', pct: 30 },
            { name: 'B', val: '', pct: 30 },
          ],
        },
      },
    ]);
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).toContain('breakdown-sum');
  });

  it('tolerates rounding (97–103 is fine)', () => {
    // A real 3-block canvas — isolates the rounding tolerance from the too-sparse check
    // (minimum 3 blocks required, so only the sum logic is tested here).
    const r = resp([
      {
        type: 'insight',
        col: 4,
        delay: 0,
        id: 'live-1',
        num: '1',
        props: { title: 'Where it goes', conf: 'inferred' },
      },
      {
        type: 'breakdown',
        col: 4,
        delay: 90,
        props: {
          title: 'ok',
          rows: [
            { name: 'A', val: '', pct: 33 },
            { name: 'B', val: '', pct: 33 },
            { name: 'C', val: '', pct: 34 },
          ],
        },
      },
      { type: 'list', col: 4, delay: 180, props: { title: 'Detail', items: ['a', 'b'] } },
    ]);
    expect(checkConsistency(r)).toEqual([]);
  });

  it('flags a chart with a single data point (not a trend)', () => {
    const r = resp([
      {
        type: 'chart',
        col: 8,
        delay: 0,
        props: {
          title: 'one',
          labels: ['May'],
          series: [{ name: 'S', color: 'var(--presence)', data: [5] }],
        },
      },
    ]);
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).toContain('chart-too-short');
  });

  it('flags a chart whose data length disagrees with its labels', () => {
    const r = resp([
      {
        type: 'chart',
        col: 8,
        delay: 0,
        props: {
          title: 'mismatch',
          labels: ['Jan', 'Feb', 'Mar'],
          series: [{ name: 'S', color: 'var(--presence)', data: [1, 2] }],
        },
      },
    ]);
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).toContain('chart-len-mismatch');
  });

  it('flags an answer with no visualization variety', () => {
    const r = resp([
      { type: 'insight', col: 4, delay: 0, id: 'live-1', num: '1', props: { title: 'one' } },
      { type: 'insight', col: 4, delay: 90, id: 'live-2', num: '2', props: { title: 'two' } },
    ]);
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).toContain('no-variety');
  });

  it('repairInstruction lists every detected problem', () => {
    const issues = [
      { code: 'breakdown-sum', detail: 'shares do not add up' },
      { code: 'no-variety', detail: 'all blocks the same' },
    ];
    const text = repairInstruction(issues);
    expect(text).toContain('shares do not add up');
    expect(text).toContain('all blocks the same');
    expect(text).toMatch(/corrected single JSON object/i);
  });
});

describe('specialization floor — the "same ten components every time" collapse', () => {
  it('flags a rich canvas built ENTIRELY from the common staples', () => {
    // Eight blocks, all from the standard dozen, no specialized component in sight.
    const r = resp(STAPLES.map((t) => block(t)));
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).toContain('low-variety');
  });

  it('passes a rich canvas that reaches ≥3 specialized components', () => {
    const r = resp([
      block('insight'),
      block('kpi'),
      block('timeline'),
      block('bars'),
      block('scatter'),
      block('radar'),
      block('sankey'),
      block('matrix'),
    ]);
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).not.toContain('low-variety');
  });

  it('does NOT flag a short (<8 block) canvas of staples — only rich canvases must reach', () => {
    const r = resp([block('insight'), block('kpi'), block('timeline')]);
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).not.toContain('low-variety');
  });

  it('does NOT flag a rich canvas that REUSES one specialized type for distinct content (G1)', () => {
    // sankey appears twice (two genuinely different flows) but there are still ≥3 DISTINCT
    // specialized types, so variety is fine — fit-driven reuse must never read as a collapse.
    const r = resp([
      block('insight'),
      block('kpi'),
      block('chart'),
      block('scatter'),
      block('radar'),
      block('sankey'),
      block('sankey'),
      block('matrix'),
    ]);
    expect(checkConsistency(r).map((i) => i.code)).not.toContain('low-variety');
  });

  it('fires at the boundary — exactly 2 distinct specialized types in a rich canvas', () => {
    // 6 staples + 2 specialized = 8 blocks, 2 < the floor of 3 → must flag.
    const r = resp([
      block('insight'),
      block('kpi'),
      block('chart'),
      block('timeline'),
      block('bars'),
      block('gauge'),
      block('scatter'),
      block('radar'),
    ]);
    expect(checkConsistency(r).map((i) => i.code)).toContain('low-variety');
  });

  it('clears at the boundary — exactly 3 distinct specialized types in a rich canvas', () => {
    // 5 staples + 3 specialized = 8 blocks, 3 meets the floor → must NOT flag.
    const r = resp([
      block('insight'),
      block('kpi'),
      block('chart'),
      block('timeline'),
      block('bars'),
      block('scatter'),
      block('radar'),
      block('sankey'),
    ]);
    expect(checkConsistency(r).map((i) => i.code)).not.toContain('low-variety');
  });

  it('treats low-variety as a hard issue (worth one repair call)', () => {
    expect(hasHardIssue([{ code: 'low-variety', detail: 'collapsed to staples' }])).toBe(true);
  });

  it('repairInstruction names the unused hero components to reach for', () => {
    const text = repairInstruction(
      [{ code: 'low-variety', detail: 'collapsed' }],
      ['scatter', 'sankey', 'radar'],
    );
    expect(text).toContain('scatter');
    expect(text).toContain('sankey');
    expect(text).toMatch(/did not use/i);
  });

  it('repairInstruction omits the hero line when there are no unused heroes', () => {
    const text = repairInstruction([{ code: 'low-variety', detail: 'collapsed' }]);
    expect(text).not.toMatch(/did not use/i);
    expect(text).toMatch(/corrected single JSON object/i);
  });
});

describe('autoFix — deterministic, zero-call repair (saves model calls)', () => {
  // helpers — autoFix may prepend a framing insight, so find blocks by type.
  const findBreakdown = (r: LiveResponse) => r.blocks.find((b) => b.type === 'breakdown');
  const findChart = (r: LiveResponse) => r.blocks.find((b) => b.type === 'chart');

  it('normalizes breakdown shares to sum exactly 100', () => {
    const r = resp([
      {
        type: 'breakdown',
        col: 4,
        delay: 0,
        props: {
          title: 'x',
          rows: [
            { name: 'A', val: '', pct: 30 },
            { name: 'B', val: '', pct: 30 },
          ],
        },
      },
    ]);
    const fixed = autoFix(r);
    const b = findBreakdown(fixed);
    if (!b || b.type !== 'breakdown') throw new Error('expected breakdown');
    expect(b.props.rows.reduce((a, x) => a + x.pct, 0)).toBe(100);
    // and the consistency check no longer fires — no model call needed
    expect(checkConsistency(fixed).map((i) => i.code)).not.toContain('breakdown-sum');
  });

  it('leaves an already-valid breakdown untouched', () => {
    const r = resp([
      {
        type: 'breakdown',
        col: 4,
        delay: 0,
        props: {
          title: 'x',
          rows: [
            { name: 'A', val: '', pct: 60 },
            { name: 'B', val: '', pct: 40 },
          ],
        },
      },
    ]);
    const b = findBreakdown(autoFix(r));
    if (!b || b.type !== 'breakdown') throw new Error('expected breakdown');
    expect(b.props.rows.map((x) => x.pct)).toEqual([60, 40]);
  });

  it('aligns a chart whose data is longer than its labels (no model call)', () => {
    const r = resp([
      {
        type: 'chart',
        col: 8,
        delay: 0,
        props: {
          title: 'c',
          labels: ['Jan', 'Feb'],
          series: [{ name: 'S', color: 'var(--presence)', data: [1, 2, 3, 4] }],
        },
      },
    ]);
    const fixed = autoFix(r);
    const b = findChart(fixed);
    if (!b || b.type !== 'chart') throw new Error('expected chart');
    // autoFix truncates the data to match label count (structural fix, no model call).
    expect(b.props.series[0].data).toEqual([1, 2]);
    // chart-length issue is resolved; canvas is still too-sparse (needs a model re-ask
    // for real additional content — autoFix can't invent blocks from nothing).
    expect(checkConsistency(fixed).some((i) => i.code === 'chart-length')).toBe(false);
    expect(checkConsistency(fixed).some((i) => i.code === 'too-sparse')).toBe(true);
  });

  it('prepends a framing insight to a lone non-insight block (≥2 blocks, no model call)', () => {
    const r = resp([
      {
        type: 'compare',
        col: 12,
        delay: 0,
        props: {
          options: [{ name: 'Train' }, { name: 'Flight' }],
          criteria: [{ label: 'Cost', cells: [{ v: '$70' }, { v: '$150' }] }],
        },
      },
    ]);
    const fixed = autoFix(r);
    expect(fixed.blocks.length).toBe(2);
    expect(fixed.blocks[0].type).toBe('insight'); // framing card first
    expect(fixed.blocks[1].type).toBe('compare'); // original visual second
  });

  it('does NOT add a framing card when an insight is already present', () => {
    const r = resp([
      { type: 'insight', col: 4, delay: 0, id: 'live-1', num: '1', props: { title: 'a' } },
    ]);
    expect(autoFix(r).blocks.length).toBe(1); // lone insight left alone
  });

  it('does NOT mask a 1-point chart — that stays a hard issue for the model', () => {
    const r = resp([
      {
        type: 'chart',
        col: 8,
        delay: 0,
        props: {
          title: 'c',
          labels: ['May'],
          series: [{ name: 'S', color: 'var(--presence)', data: [5] }],
        },
      },
    ]);
    const issues = checkConsistency(autoFix(r));
    expect(hasHardIssue(issues)).toBe(true); // → the one case worth a repair call
  });

  it('no-variety alone is NOT a hard issue (not worth a model call)', () => {
    const issues = [{ code: 'no-variety', detail: 'all the same' }];
    expect(hasHardIssue(issues)).toBe(false);
  });
});

describe('fabricated action claims', () => {
  it('flags narration claiming a completed action with no action block', () => {
    const r = resp([block('insight', { title: 'Done' })]);
    r.narration = "I've added that to your calendar.";
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).toContain('fabricated-action-claim');
  });

  it('does NOT flag a real action proposal (the "action" block is present)', () => {
    const r = resp([
      block('insight', { title: 'Done' }),
      block('action', { id: 'calendar.addEvent', args: {} }),
    ]);
    r.narration = "I've added that to your calendar.";
    const codes = checkConsistency(r).map((i) => i.code);
    expect(codes).not.toContain('fabricated-action-claim');
  });

  it('does NOT flag an honest offer ("I can …") or a future-tense line', () => {
    const r = resp([block('insight', { title: 'Done' })]);
    r.narration = 'I can send that email for you, or you can review it first.';
    expect(checkConsistency(r).map((i) => i.code)).not.toContain('fabricated-action-claim');
    r.narration = "I'll send it once you confirm.";
    expect(checkConsistency(r).map((i) => i.code)).not.toContain('fabricated-action-claim');
  });

  it('is not a hard issue — autoFix rewrites it for free instead of a repair round-trip', () => {
    expect(hasHardIssue([{ code: 'fabricated-action-claim', detail: '' }])).toBe(false);
  });

  it('autoFix rewrites the false completion claim into an honest offer', () => {
    const r = resp([block('insight', { title: 'Done' })]);
    r.narration = "I've sent the email to your manager.";
    const fixed = autoFix(r);
    expect(fixed.narration).toBe('I can send the email to your manager.');
    expect(checkConsistency(fixed).map((i) => i.code)).not.toContain('fabricated-action-claim');
  });

  it('autoFix leaves narration alone when a real action block backs the claim', () => {
    const r = resp([
      block('insight', { title: 'Done' }),
      block('action', { id: 'calendar.addEvent', args: {} }),
    ]);
    r.narration = "I've drafted the email — take a look.";
    expect(autoFix(r).narration).toBe("I've drafted the email — take a look.");
  });

  it('autoFix rewrites the spoken voice twin the same way', () => {
    const r = resp([block('insight', { title: 'Done' })]);
    r.narration = 'Done!';
    r.spoken = "I've booked the meeting for you.";
    const fixed = autoFix(r);
    expect(fixed.spoken).toBe('I can book the meeting for you.');
  });
});
