// The key-free Blank Space walkthrough hand-authors two frames (answer WITH holes, then completed).
// This pins the load-bearing facts the browser can't easily show: the holes frame carries a real
// `blanks` block that renders two glowing slots + the spec-level awaiting/blanks the Complete bar
// reads, and the completed frame drops both. Deterministic — no timing, no session, no model.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Blanks } from '../src/canvas/blocks/forms/Blanks';
import { buildBlanksDemo } from '../src/tour/blanksDemo';
import type { BlanksProps } from '../src/canvas/blocks/forms/types';
import type { ConversationSpec } from '../src/data/conversation';

// A minimal but structurally valid scaffold — buildBlanksDemo only reuses its routing fields.
const scaffold = {
  id: 'money',
  workspace: 'Money',
  title: 't',
  sub: 's',
  opener: 'o',
  context: [],
  blocks: [],
  proof: null,
  extras: {},
  group: 'money',
  suggests: [],
} as unknown as ConversationSpec;

describe('blanks demo — the key-free walkthrough frames', () => {
  it('holes frame carries a blanks block that renders two glowing slots', () => {
    const { holes } = buildBlanksDemo(scaffold);
    const block = holes.spec.blocks.find((b) => b.type === 'blanks');
    expect(block, 'holes frame has a blanks block').toBeTruthy();
    const { container } = render(<Blanks {...(block!.props as BlanksProps)} />);
    // The real feature: one fillable hole per value only the user can give.
    expect(container.querySelectorAll('.blank-slot')).toHaveLength(2);
    expect(container.querySelector('.blanks-grid')).toBeTruthy();
  });

  it('holes frame is awaiting with spec-level blanks; the completed frame is neither', () => {
    const { holes, filled } = buildBlanksDemo(scaffold);
    expect(holes.spec.awaiting).toBe(true);
    expect(holes.spec.blanks).toHaveLength(2);
    // The completed twin: no holes, not awaiting, and it actually shows a result (the runway).
    expect(filled.spec.awaiting).toBe(false);
    expect(filled.spec.blanks).toBeUndefined();
    expect(filled.spec.blocks.some((b) => b.type === 'blanks')).toBe(false);
    expect(filled.spec.blocks.length).toBeGreaterThan(0);
    expect(filled.narration.trim().length).toBeGreaterThan(0);
  });
});
