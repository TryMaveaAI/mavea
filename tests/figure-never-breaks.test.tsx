import { readFileSync } from 'node:fs';
import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BarChart } from '../src/canvas/BarChart';
import { KpiGrid } from '../src/canvas/KpiGrid';

afterEach(cleanup);

// A formatted figure is one term. The card's last-resort `word-break: break-word` let it break at
// any character once its box ran short: a bar's value read "3,0" over "00" because its label was
// bounded by the 46px bar rather than its column. The rule lives at the seam — `.card .tab-num` —
// so this mounts real blocks under the real stylesheet and reads what the cascade gives the
// figure, not what a component happens to declare.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/styles/visualizations-extra.css', 'utf8');
  document.head.appendChild(style);
});

const breaks = (el: Element) => {
  const cs = getComputedStyle(el);
  return { wrap: cs.overflowWrap, word: cs.wordBreak };
};

describe('a formatted figure never breaks inside itself', () => {
  it('holds a long value over a narrow bar on one line, fitted to its column', () => {
    const { container } = render(
      <BarChart
        title="Volume loss"
        bars={[
          { label: 'Lost activated users', value: 3000 },
          { label: 'Lost retained users', value: 1712 },
          { label: 'Lost paid users', value: 425 },
        ]}
      />,
    );
    // The card itself still carries the backstop for prose and URLs…
    expect(getComputedStyle(container.querySelector('.card')!).wordBreak).toBe('break-word');
    const vals = Array.from(container.querySelectorAll<HTMLElement>('.bar-val'));
    expect(vals.map((v) => v.textContent)).toEqual(['3,000', '1,712', '425']);
    for (const v of vals) {
      // …and the figure opts out of it: no break inside the digits.
      expect(breaks(v)).toEqual({ wrap: 'normal', word: 'normal' });
      // Its type is fitted to the run it has to hold whole.
      expect(v.style.getPropertyValue('--bar-val-chars')).toBe(String(v.textContent!.length));
    }
  });

  it('covers the other figure blocks through the same class', () => {
    const { container } = render(
      <KpiGrid title="Vital signs" kpis={[{ val: '112,000', label: 'Weekly Active Users' }]} />,
    );
    expect(breaks(container.querySelector('.kpi-val')!)).toEqual({
      wrap: 'normal',
      word: 'normal',
    });
  });
});
