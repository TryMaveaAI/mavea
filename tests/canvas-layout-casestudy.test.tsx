import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Casestudy } from '../src/canvas/blocks/layout/Casestudy';
import type { CasestudyProps } from '../src/canvas/blocks/layout/types';

// The rail (icon + connecting line) has to be a stage-level sibling of the head/body, not
// nested inside the collapsed head row — that's what lets its CSS span the whole stage
// (head + an expanded body) instead of breaking the line the moment a non-last stage opens.

afterEach(cleanup);

const PROPS: CasestudyProps = {
  title: 'A reference that worked',
  subject: 'How a 3-day edit hit a calm, vast feel',
  setup: { body: 'Same brief, different rock.' },
  action: { body: 'They shot at the edges of the day.' },
  result: { body: 'The film felt like one breath.' },
  lesson: { body: 'Constraint is the look.' },
};

describe('Casestudy rail structure', () => {
  it('keeps the rail a direct child of the stage, never nested inside the head button', () => {
    const { container } = render(<Casestudy {...PROPS} defaultStage="setup" />);
    const stages = container.querySelectorAll('.lay-cs-stage');
    expect(stages.length).toBe(4);
    stages.forEach((stage) => {
      const rail = stage.querySelector(':scope > .lay-cs-rail');
      expect(rail).not.toBeNull();
      expect(stage.querySelector('.lay-cs-head .lay-cs-rail')).toBeNull();
    });
  });

  it('draws a connecting line for every stage but the last, regardless of which is open', () => {
    const { container } = render(<Casestudy {...PROPS} defaultStage="action" />);
    const rails = Array.from(container.querySelectorAll('.lay-cs-rail'));
    expect(rails.map((r) => r.classList.contains('has-line'))).toEqual([true, true, true, false]);
    rails.slice(0, 3).forEach((rail) => {
      expect(rail.querySelector('.lay-cs-line')).not.toBeNull();
    });
    expect(rails[3].querySelector('.lay-cs-line')).toBeNull();
  });
});
