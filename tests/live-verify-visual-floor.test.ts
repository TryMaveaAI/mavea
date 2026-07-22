// live-verify-visual-floor.test.ts — guards the "visual-presence floor" check.
//
// The failure this locks against (reported from real Live use): a valid answer lands as nothing
// but prose cards (insight/list) — no chart, comparison, timeline, or diagram — so there's
// literally nothing to SEE. It slips past `low-variety` (which only fires at ≥8 blocks) and past
// `too-sparse` (which only counts blocks), and reads as a broken/generic reply. checkConsistency
// now flags `no-visual` (a HARD issue) on any NON-brief answer built entirely from prose staples,
// routing it to the generateLive repair pass which re-asks for a fitting visual hero. Brief asks
// are exempt: a couple of text cards is a complete answer to a quick factual question.
import { validateLiveResponse } from '../src/engine/liveSchema';
import { checkConsistency, hasHardIssue, HARD_ISSUE_CODES } from '../src/live/verify';

function build(blocks: object[]) {
  const resp = validateLiveResponse({
    title: 'Test',
    sub: 'Test sub',
    narration: 'A spoken line.',
    blocks,
  });
  if (!resp) throw new Error('fixture failed to validate');
  return resp;
}

const insight = (title: string) => ({ type: 'insight', props: { title } });
const list = (title: string) => ({
  type: 'list',
  props: { title, items: ['one', 'two', 'three'] },
});
const kpi = (title: string) => ({
  type: 'kpi',
  props: {
    title,
    kpis: [
      { label: 'A', val: '10' },
      { label: 'B', val: '20' },
    ],
  },
});

function codes(r: ReturnType<typeof build>, complexity?: 'brief' | 'lean' | 'rich'): string[] {
  return checkConsistency(r, complexity).map((i) => i.code);
}

describe('verify — visual-presence floor', () => {
  it('lists no-visual as a HARD issue code', () => {
    expect(HARD_ISSUE_CODES.has('no-visual')).toBe(true);
  });

  it('flags an all-prose non-brief answer (insight + list + list) as no-visual', () => {
    const r = build([insight('Headline'), list('Options'), list('Caveats')]);
    expect(r.blocks).toHaveLength(3); // fixtures survived validation
    const c = codes(r, 'rich');
    expect(c).toContain('no-visual');
    expect(hasHardIssue(checkConsistency(r, 'rich'))).toBe(true);
  });

  it('does NOT flag when at least one visual is present (insight + list + kpi)', () => {
    const r = build([insight('Headline'), list('Options'), kpi('Numbers')]);
    expect(r.blocks).toHaveLength(3);
    expect(codes(r, 'rich')).not.toContain('no-visual');
  });

  it('does NOT flag a brief all-prose answer — a couple of text cards is complete there', () => {
    const r = build([insight('Direct answer'), list('A few points')]);
    expect(codes(r, 'brief')).not.toContain('no-visual');
  });

  it('flags a lean all-prose answer too (the floor is not just for rich canvases)', () => {
    const r = build([insight('Headline'), list('Options')]);
    expect(codes(r, 'lean')).toContain('no-visual');
  });

  it('defaults to flagging (complexity defaults to rich) so the after-repair recheck agrees', () => {
    const r = build([insight('Headline'), list('Options'), list('More')]);
    // No complexity arg — matches generateLive's post-repair checkConsistency(fixed2) call.
    expect(codes(r)).toContain('no-visual');
  });
});
