// live-verify-sparse.test.ts — guards the "too-sparse canvas" check.
//
// Live answers need at least 3 blocks. checkConsistency flags `too-sparse` (a HARD issue)
// whenever blocks.length < 3, routing to the generateLive repair path which re-asks for a
// fuller answer. autoFix can prepend a framing insight to a lone non-insight (1→2 blocks),
// but 2 blocks is still below the floor — the sparse flag remains and the model must supply
// the real additional content (autoFix can't invent it).
import { validateLiveResponse } from '../src/engine/liveSchema';
import { checkConsistency, hasHardIssue, autoFix, HARD_ISSUE_CODES } from '../src/live/verify';

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

describe('verify — sparse canvas', () => {
  it('lists too-sparse as a HARD issue code', () => {
    expect(HARD_ISSUE_CODES.has('too-sparse')).toBe(true);
  });

  it('flags a one-block canvas as too-sparse', () => {
    const r = build([{ type: 'insight', props: { title: 'A lone finding' } }]);
    expect(r.blocks.length).toBe(1);
    const issues = checkConsistency(r);
    expect(issues.some((i) => i.code === 'too-sparse')).toBe(true);
    expect(hasHardIssue(issues)).toBe(true);
  });

  it('does NOT flag a multi-block canvas', () => {
    const r = build([
      { type: 'insight', props: { title: 'Headline' } },
      { type: 'kpi', props: { title: 'Numbers', items: [{ label: 'A', value: '1' }] } },
      { type: 'list', props: { title: 'Steps', items: ['one', 'two', 'three'] } },
    ]);
    expect(r.blocks.length).toBeGreaterThan(1);
    expect(checkConsistency(r).some((i) => i.code === 'too-sparse')).toBe(false);
  });

  it('still flags a lone insight after autoFix (the real "one odd element" path)', () => {
    // autoFix only frames a lone NON-insight; a bare insight survives at length 1, so the
    // sparse check is what catches it and routes it to a repair.
    const fixed = autoFix(build([{ type: 'insight', props: { title: 'Just one card' } }]));
    expect(fixed.blocks.length).toBe(1);
    expect(hasHardIssue(checkConsistency(fixed))).toBe(true);
  });

  it('does NOT flag a one-block canvas as too-sparse for a brief ask', () => {
    // A 'brief' ask is the user explicitly asking for a short answer — a single card is the
    // correct, complete response, not a sparse one that needs padding back up.
    const r = build([{ type: 'insight', props: { title: 'A lone finding' } }]);
    expect(r.blocks.length).toBe(1);
    const issues = checkConsistency(r, 'brief');
    expect(issues.some((i) => i.code === 'too-sparse')).toBe(false);
  });

  it('still flags an empty canvas as too-sparse even for a brief ask', () => {
    const r = build([]);
    expect(checkConsistency(r, 'brief').some((i) => i.code === 'too-sparse')).toBe(true);
  });

  it('autoFix prepends a framing insight to a lone non-insight (2 blocks, still too-sparse)', () => {
    // autoFix adds a framing card (structural fix), but 2 blocks is still below the 3-block
    // floor — the too-sparse flag remains and routes to a model re-ask for real content.
    const fixed = autoFix(
      build([{ type: 'list', props: { title: 'Tips', items: ['a', 'b', 'c'] } }]),
    );
    expect(fixed.blocks.length).toBe(2); // framing insight + the list
    expect(fixed.blocks[0].type).toBe('insight');
    expect(checkConsistency(fixed).some((i) => i.code === 'too-sparse')).toBe(true);
  });
});
