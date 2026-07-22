import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PieDonut } from '../src/canvas/blocks/charts1/PieDonut';
import { DistributionCurve } from '../src/canvas/blocks/charts1/DistributionCurve';
import { ScatterRegression } from '../src/canvas/blocks/charts2/ScatterRegression';
import { Flashcard } from '../src/canvas/blocks/learn/Flashcard';
import { SequenceDiagram } from '../src/canvas/blocks/diagrams/SequenceDiagram';
import { DiffViewer } from '../src/canvas/blocks/docs/DiffViewer';
import { SensitivityTable } from '../src/canvas/blocks/tables/SensitivityTable';

describe('PieDonut', () => {
  it('renders one arc per slice with percentage legend', () => {
    const { container } = render(
      <PieDonut
        title="Split"
        slices={[
          { label: 'A', value: 75 },
          { label: 'B', value: 25 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.c1-pd-arc')).toHaveLength(2);
    expect(screen.getByText(/A · 75%/)).toBeInTheDocument();
  });
  it('shows an empty state when every value is zero', () => {
    render(<PieDonut title="Nothing" slices={[{ label: 'A', value: 0 }]} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('DistributionCurve', () => {
  it('draws a curve and a shaded tail region', () => {
    const { container } = render(
      <DistributionCurve title="Z" kind="normal" mean={0} sd={1} shadeFrom={1.6} />,
    );
    expect(container.querySelector('.c1-dist-curve')).toBeTruthy();
    expect(container.querySelector('.c1-dist-shade.tail')).toBeTruthy();
  });
});

describe('ScatterRegression', () => {
  it('computes a fit line and shows R²', () => {
    render(
      <ScatterRegression
        title="Fit"
        points={[
          { x: 1, y: 2 },
          { x: 2, y: 4 },
          { x: 3, y: 6 },
        ]}
      />,
    );
    // Perfectly collinear points → R² = 1.00.
    expect(screen.getByText('R² = 1.00')).toBeInTheDocument();
  });
});

describe('Flashcard', () => {
  it('flips front to back on click', () => {
    const { container } = render(<Flashcard title="Deck" cards={[{ front: 'Q', back: 'A' }]} />);
    const card = container.querySelector('.lr-fc')!;
    expect(card.className).not.toContain('flipped');
    fireEvent.click(card);
    expect(card.className).toContain('flipped');
  });
});

describe('SequenceDiagram', () => {
  it('renders a lifeline per actor and a label per message', () => {
    const { container } = render(
      <SequenceDiagram
        title="Flow"
        actors={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        messages={[{ from: 'a', to: 'b', label: 'call' }]}
      />,
    );
    expect(container.querySelectorAll('.dg-seq-life')).toHaveLength(2);
    expect(screen.getByText('call')).toBeInTheDocument();
  });
});

describe('DiffViewer', () => {
  it('tallies additions and removals and renders each line', () => {
    render(
      <DiffViewer
        title="Diff"
        lines={[
          { kind: 'ctx', text: 'a', oldNo: 1, newNo: 1 },
          { kind: 'del', text: 'b', oldNo: 2 },
          { kind: 'add', text: 'c', newNo: 2 },
        ]}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
  });
});

describe('SensitivityTable', () => {
  it('renders a cell per (row, col) and marks the base case', () => {
    const { container } = render(
      <SensitivityTable
        title="What-if"
        rowVar="r"
        rows={[1, 2]}
        colVar="c"
        cols={['x', 'y']}
        cells={[
          [10, 20],
          [30, 40],
        ]}
        baseCell={[0, 0]}
      />,
    );
    expect(container.querySelectorAll('.tb-sens-cell')).toHaveLength(4);
    expect(container.querySelector('.tb-sens-cell.is-base')).toBeTruthy();
  });
});
