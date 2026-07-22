import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StackTrace } from '../src/canvas/blocks/code/StackTrace';
import type { StackFrame } from '../src/canvas/blocks/code/types';

// Regression coverage for a real bug: .st-frame-num carried a fixed `min-width: 20px`, sized for
// the ~3-frame demo fixture's 1-2 digit numbers. A deep trace (100+ frames, 3-digit numbers) needs
// more room than that floor allows — a hardcoded min-width can't grow with the content, so later
// digits got squeezed against the file column instead of the layout simply widening to fit.

function frames(n: number): StackFrame[] {
  return Array.from({ length: n }, (_, i) => ({
    file: `src/module${i}.ts`,
    line: 10 + i,
    fn: `handler${i}`,
    isUser: i === n - 1,
  }));
}

describe('StackTrace', () => {
  it('sizes the frame number column to fit 3-digit frame counts, not a fixed digit budget', () => {
    const { container } = render(
      <StackTrace
        title="Crash"
        errorType="RangeError"
        message="Maximum call stack size exceeded"
        frames={frames(120)}
      />,
    );
    const nums = Array.from(container.querySelectorAll<HTMLElement>('.st-frame-num'));
    expect(nums).toHaveLength(120);

    // Every frame number renders in full — no digit was truncated or dropped to fit a fixed box.
    nums.forEach((el, i) => {
      expect(el.textContent).toBe(String(i + 1));
    });

    // The fixed 20px floor is gone: the column now sizes to its content so a 3-digit number
    // (e.g. "120") never gets clamped narrower than what it needs to render legibly.
    const lastNum = nums[nums.length - 1];
    expect(lastNum.textContent).toBe('120');
    expect(lastNum.style.minWidth).not.toBe('20px');
    expect(lastNum.style.minWidth).toBe('max-content');
  });

  it('keeps short traces (the demo-fixture shape) rendering exactly as before', () => {
    const { container } = render(
      <StackTrace
        title="Crash"
        errorType="TypeError"
        message="Cannot read properties of undefined"
        frames={frames(3)}
      />,
    );
    const nums = Array.from(container.querySelectorAll('.st-frame-num'));
    expect(nums.map((n) => n.textContent)).toEqual(['1', '2', '3']);
  });
});
