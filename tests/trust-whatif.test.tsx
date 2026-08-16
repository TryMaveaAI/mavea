// The what-if frame's whole job is that a modelled number can never be mistaken for a measured
// one. These lock the two invariants that carry it: an untouched answer has exactly one column and
// says nothing about hypotheticals, and an ungrounded projection speaks in words with no digits in
// them at all — while the HYPOTHETICAL chip is present either way, so the styling is never the only
// signal.
import { useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WhatIfFrame, type WhatIfReadout } from '../src/live/trust/WhatIfFrame';
import { FULL_PCT, LeverRail, type Lever } from '../src/live/trust/LeverRail';

const GROUNDED_BASE: WhatIfReadout = {
  exactBase: 42,
  exactDelta: 0,
  explainedPct: 0.8,
  fullyGrounded: true,
  relBase: null,
  relCur: null,
};

const UNGROUNDED_BASE: WhatIfReadout = {
  exactBase: null,
  exactDelta: null,
  explainedPct: null,
  fullyGrounded: false,
  relBase: 0.6,
  relCur: 0.6,
};

describe('WhatIfFrame', () => {
  it('is one observed column until something is pulled', () => {
    const { container } = render(
      <WhatIfFrame baseline={GROUNDED_BASE} current={GROUNDED_BASE} unit="%" active={false} />,
    );
    expect(container.querySelectorAll('.tr-wi-col').length).toBe(1);
    expect(container.textContent).toContain('OBSERVED');
    expect(container.textContent).not.toContain('HYPOTHETICAL');
    expect(container.querySelector('[data-world="hypothetical"]')).toBeNull();
  });

  it('marks the second column hypothetical and shows an exact grounded delta', () => {
    const { container } = render(
      <WhatIfFrame
        baseline={GROUNDED_BASE}
        current={{ ...GROUNDED_BASE, exactDelta: 2.4, explainedPct: 0.75 }}
        unit="%"
        active
      />,
    );
    const hypo = container.querySelector('[data-world="hypothetical"]');
    expect(hypo).toBeTruthy();
    expect(container.querySelectorAll('.tr-wi-col').length).toBe(2);
    expect(screen.getByText('HYPOTHETICAL (MODELED)').getAttribute('title')).toContain(
      'never an observation',
    );
    expect(hypo?.querySelector('.tr-wi-figure')?.textContent).toBe('44.4%');
    expect(hypo?.querySelector('.tr-wi-delta')?.textContent).toBe('+2.4%');
    expect(hypo?.querySelector('.tr-wi-note')?.textContent).toBe('75% explained');
    // The observed column never moves.
    expect(container.querySelector('.tr-wi-col .tr-wi-figure')?.textContent).toBe('42%');
  });

  it('speaks an ungrounded projection in words, with no digits anywhere in it', () => {
    const { container } = render(
      <WhatIfFrame
        baseline={UNGROUNDED_BASE}
        current={{ ...UNGROUNDED_BASE, relCur: 0.2 }}
        active
      />,
    );
    const hypo = container.querySelector('[data-world="hypothetical"]');
    expect(hypo?.textContent).toMatch(/would (rise|fall|barely)/);
    expect(hypo?.textContent).toContain('relative, not measured');
    expect(hypo?.textContent ?? '').not.toMatch(/\d/);
    expect(container.querySelector('.tr-wi-col .tr-wi-figure')?.textContent).toBe('—');
  });

  it('says why the observed column is a dash, and lets the surface say it better', () => {
    const { container, rerender } = render(
      <WhatIfFrame baseline={UNGROUNDED_BASE} current={UNGROUNDED_BASE} active={false} />,
    );
    const why = (): string => container.querySelector('.tr-wi-why')!.textContent!;
    expect(why()).toMatch(/nothing measured/);
    // A dash that explains itself still says nothing it cannot back.
    expect(container.querySelector('.tr-wi')!.textContent).not.toMatch(/\d/);

    // A grounded base that the path cannot carry all the way stops on a different rung.
    rerender(
      <WhatIfFrame
        baseline={{ ...UNGROUNDED_BASE, exactBase: 42 }}
        current={UNGROUNDED_BASE}
        active={false}
      />,
    );
    expect(why()).toMatch(/not every step is grounded/);

    // The surface knows things the ladder cannot see, and outranks it when it does.
    rerender(
      <WhatIfFrame
        baseline={UNGROUNDED_BASE}
        current={UNGROUNDED_BASE}
        active={false}
        observedNote="an illustrative world measures nothing"
      />,
    );
    expect(why()).toBe('an illustrative world measures nothing');
  });

  it('drops the "% explained" line rather than print a share that is not one', () => {
    // A dampening link carries sign −1 into the engine's sum, so the fully-grounded world in the
    // corpus hands this frame explainedPct = −0.29 and the line read "−29% explained". The delta
    // and the projected total are computed separately and must survive the line that was lying.
    const { container } = render(
      <WhatIfFrame
        baseline={GROUNDED_BASE}
        current={{ ...GROUNDED_BASE, exactDelta: 2.4, explainedPct: -0.29 }}
        unit="%"
        active
      />,
    );
    const hypo = container.querySelector('[data-world="hypothetical"]')!;
    expect(hypo.textContent).not.toContain('explained');
    expect(hypo.querySelector('.tr-wi-figure')?.textContent).toBe('44.4%');
    expect(hypo.querySelector('.tr-wi-delta')?.textContent).toBe('+2.4%');
  });

  it('falls to a dash — but never to a dash alone — with nothing to say', () => {
    const empty: WhatIfReadout = {
      exactBase: null,
      exactDelta: null,
      explainedPct: null,
      fullyGrounded: false,
      relBase: null,
      relCur: null,
    };
    const { container } = render(<WhatIfFrame baseline={empty} current={empty} active />);
    const hypo = container.querySelector('[data-world="hypothetical"]');
    expect(hypo?.querySelector('.tr-wi-figure')?.textContent).toBe('—');
    expect(hypo?.textContent).toContain('HYPOTHETICAL (MODELED)');
  });
});

/** The real wiring: the rail owns the levers, and the frame's second column exists exactly while
 *  one of them is off its observed strength. */
function Harness(): ReactElement {
  const [levers, setLevers] = useState<Lever[]>([{ id: 'ads', label: 'Ad spend', pct: FULL_PCT }]);
  const active = levers.some((l) => l.pct !== FULL_PCT);
  return (
    <>
      <LeverRail
        levers={levers}
        onSet={(id, pct) => setLevers((ls) => ls.map((l) => (l.id === id ? { ...l, pct } : l)))}
        onReset={() => setLevers((ls) => ls.map((l) => ({ ...l, pct: FULL_PCT })))}
      />
      <WhatIfFrame
        baseline={UNGROUNDED_BASE}
        current={{ ...UNGROUNDED_BASE, relCur: 0.3 }}
        active={active}
      />
    </>
  );
}

describe('LeverRail', () => {
  it('says why there is nothing to pull rather than heading an empty space', () => {
    const { container } = render(<LeverRail levers={[]} onSet={() => {}} onReset={() => {}} />);
    expect(container.querySelector('.viz-ctl')).toBeNull();
    expect(container.querySelector('.tr-levers-empty')?.textContent).toMatch(/no cause/i);
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveProperty('disabled', true);
  });

  it('starts inert and collapses the hypothetical column on reset', () => {
    const { container } = render(<Harness />);
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toHaveProperty('disabled', true);
    expect(container.querySelector('[data-world="hypothetical"]')).toBeNull();

    fireEvent.change(screen.getByLabelText('Ad spend'), { target: { value: '40' } });
    expect(reset).toHaveProperty('disabled', false);
    expect(container.querySelector('[data-world="hypothetical"]')).toBeTruthy();
    expect(container.querySelector('.viz-ctl-val')?.textContent).toBe('40%');

    fireEvent.click(reset);
    expect(container.querySelector('[data-world="hypothetical"]')).toBeNull();
    expect(reset).toHaveProperty('disabled', true);
  });
});
