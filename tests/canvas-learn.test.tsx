import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EquationBlock } from '../src/canvas/blocks/learn/EquationBlock';
import { NumberLine } from '../src/canvas/blocks/learn/NumberLine';
import { WorkedExample } from '../src/canvas/blocks/learn/WorkedExample';
import { Quiz } from '../src/canvas/blocks/learn/Quiz';
import { GridMatrix } from '../src/canvas/blocks/learn/GridMatrix';
import type { MathNode } from '../src/canvas/blocks/learn/types';

// The quadratic formula as an AST: x = (−b ± √(b²−4ac)) / 2a
const quadratic: MathNode = {
  t: 'row',
  items: [
    { t: 'ident', v: 'x' },
    { t: 'op', v: '=' },
    {
      t: 'frac',
      num: {
        t: 'row',
        items: [
          { t: 'op', v: '−' },
          { t: 'ident', v: 'b' },
          { t: 'op', v: '±' },
          { t: 'sqrt', arg: { t: 'row', items: [{ t: 'ident', v: 'b' }] } },
        ],
      },
      den: {
        t: 'row',
        items: [
          { t: 'num', v: '2' },
          { t: 'ident', v: 'a' },
        ],
      },
    },
  ],
};

describe('EquationBlock', () => {
  it('renders native MathML for the equation', () => {
    const { container } = render(<EquationBlock title="Quadratic formula" math={quadratic} />);
    // Real MathML elements are emitted (not an image, not LaTeX text). jsdom exposes them as
    // generic Elements, so assert by tag presence rather than toBeInTheDocument.
    expect(container.getElementsByTagName('math')).toHaveLength(1);
    expect(container.getElementsByTagName('mfrac').length).toBeGreaterThan(0);
    expect(container.getElementsByTagName('msqrt').length).toBeGreaterThan(0);
  });
  it('shows the equation number and caption', () => {
    render(
      <EquationBlock title="Eq" math={{ t: 'num', v: '1' }} number="(3)" caption="the unit" />,
    );
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('the unit')).toBeInTheDocument();
  });
  it('routes an explicit LaTeX `tex` prop through the KaTeX path', () => {
    const { container } = render(
      <EquationBlock title="Eigen" tex="A\mathbf{v} = \lambda\mathbf{v}" />,
    );
    // KaTeX is fetched from a CDN (absent in jsdom), so the component shows the raw-LaTeX
    // fallback — the deterministic contract: it took the tex path, not the MathNode renderer.
    const tex = container.querySelector('.lr-tex');
    expect(tex).toBeTruthy();
    expect(tex?.textContent).toContain('mathbf');
    expect(container.getElementsByTagName('mfrac')).toHaveLength(0);
  });
  it('treats a backslash-bearing `math` string as LaTeX', () => {
    const { container } = render(<EquationBlock title="Frac" math={'\\frac{a}{b}'} />);
    expect(container.querySelector('.lr-tex')).toBeTruthy();
  });
  it('still renders a plain (non-LaTeX) `math` string as MathML', () => {
    const { container } = render(<EquationBlock title="Var" math={'x'} />);
    expect(container.getElementsByTagName('math')).toHaveLength(1);
    expect(container.querySelector('.lr-tex')).toBeNull();
  });
});

describe('NumberLine', () => {
  it('renders nice ticks across the range with formatted labels', () => {
    render(<NumberLine title="Integers" min={-10} max={10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('-10')).toBeInTheDocument();
  });
  it('plots labelled points', () => {
    render(<NumberLine title="Pt" min={0} max={5} points={[{ value: 3, label: 'here' }]} />);
    expect(screen.getByText('here')).toBeInTheDocument();
  });
});

describe('WorkedExample', () => {
  const steps = [{ label: 'Start', why: 'given' }, { label: 'Isolate x' }, { label: 'Final step' }];
  it('reveals steps one at a time in progressive mode', () => {
    render(<WorkedExample title="Solve it" steps={steps} progressive />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.queryByText('Isolate x')).toBeNull(); // not yet revealed
    fireEvent.click(screen.getByText(/Next step/));
    expect(screen.getByText('Isolate x')).toBeInTheDocument();
  });
  it('shows all steps at once when not progressive', () => {
    render(<WorkedExample title="Solve it" steps={steps} progressive={false} />);
    expect(screen.getByText('Final step')).toBeInTheDocument();
    expect(screen.getByText('Isolate x')).toBeInTheDocument();
  });
});

describe('GridMatrix', () => {
  it('renders every cell of a labelled grid', () => {
    render(
      <GridMatrix
        title="Multiplication"
        rowHeaders={['1', '2']}
        colHeaders={['×', 'a', 'b']}
        cells={[
          ['r1', '1a', '1b'],
          ['r2', '2a', '2b'],
        ]}
      />,
    );
    expect(screen.getByText('1a')).toBeInTheDocument();
    expect(screen.getByText('2b')).toBeInTheDocument();
  });
  it('emits no React key warning when mapping rows (each row is a keyed Fragment)', () => {
    // A keyless `<>` returned from cells.map triggers "unique key" warnings on every
    // grid render. Spy on console.error and assert the grid renders cleanly.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <GridMatrix
        title="Truth table"
        variant="truth"
        rowHeaders={['p∧q', 'p∨q', 'p→q']}
        colHeaders={['', 'TT', 'TF', 'FT', 'FF']}
        cells={[
          ['', 'T', 'F', 'F', 'F'],
          ['', 'T', 'T', 'T', 'F'],
          ['', 'T', 'F', 'T', 'T'],
        ]}
      />,
    );
    const keyWarning = spy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('unique "key"')),
    );
    spy.mockRestore();
    expect(keyWarning).toBe(false);
  });
});

describe('Quiz', () => {
  const opts = [{ text: 'Three', correct: true }, { text: 'Four' }];
  it('reveals correctness only after answering', () => {
    render(
      <Quiz title="Q" question="What is 1 + 2?" options={opts} explanation="Basic addition." />,
    );
    expect(screen.queryByText('Correct')).toBeNull();
    fireEvent.click(screen.getByText('Three'));
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('Basic addition.')).toBeInTheDocument();
  });
  it('marks a wrong answer and reveals the right one', () => {
    render(<Quiz title="Q" question="What is 1 + 2?" options={opts} />);
    fireEvent.click(screen.getByText('Four'));
    expect(screen.getByText('Not quite')).toBeInTheDocument();
  });
});
