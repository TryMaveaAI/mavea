import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeriodicTable } from '../src/canvas/blocks/learn/PeriodicTable';
import { StateMachine } from '../src/canvas/blocks/diagrams/StateMachine';
import { ErDiagram } from '../src/canvas/blocks/diagrams/ErDiagram';
import { CircuitDiagram } from '../src/canvas/blocks/diagrams/CircuitDiagram';
import { LabPanel } from '../src/canvas/blocks/tables/LabPanel';

describe('PeriodicTable', () => {
  it('renders a cell per element and reveals detail on hover', () => {
    const { container } = render(
      <PeriodicTable
        title="PT"
        elements={[
          { z: 1, symbol: 'H', name: 'Hydrogen', col: 1, row: 1 },
          { z: 2, symbol: 'He', name: 'Helium', col: 18, row: 1 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.lr-pt-cell')).toHaveLength(2);
    fireEvent.mouseEnter(container.querySelector('.lr-pt-cell')!);
    expect(screen.getByText('Hydrogen')).toBeInTheDocument();
  });
});

describe('StateMachine', () => {
  it('renders a circle per state and a label per transition', () => {
    const { container } = render(
      <StateMachine
        title="SM"
        states={[
          { id: 'a', label: 'A', start: true },
          { id: 'b', label: 'B', final: true },
        ]}
        transitions={[{ from: 'a', to: 'b', label: 'go' }]}
      />,
    );
    expect(container.querySelectorAll('.dg-sm-circ')).toHaveLength(2);
    expect(screen.getByText('go')).toBeInTheDocument();
    // The final state gets a double ring.
    expect(container.querySelector('.dg-sm-circ-inner')).toBeTruthy();
  });
});

describe('ErDiagram', () => {
  it('renders entities with fields and a relationship with cardinality', () => {
    const { container } = render(
      <ErDiagram
        title="ER"
        entities={[
          { id: 'u', label: 'User', fields: [{ name: 'id', key: 'pk' }] },
          { id: 'p', label: 'Post', fields: [{ name: 'user_id', key: 'fk' }] },
        ]}
        relationships={[{ from: 'u', to: 'p', fromCard: '1', toCard: 'many' }]}
      />,
    );
    // Two entity cards (the label also appears in the relationship row, so scope to the cards).
    expect(container.querySelectorAll('.dg-er-entity')).toHaveLength(2);
    expect(container.querySelector('.dg-er-name')!.textContent).toBe('User');
    // PK / FK markers + the many-end cardinality.
    expect(screen.getByText('PK')).toBeInTheDocument();
    expect(screen.getByText('∞')).toBeInTheDocument();
  });
});

describe('CircuitDiagram', () => {
  it('draws a wire per connection and labels components', () => {
    const { container } = render(
      <CircuitDiagram
        title="Circuit"
        components={[
          { id: 'b', kind: 'battery', x: 20, y: 50, label: '9V' },
          { id: 'r', kind: 'resistor', x: 80, y: 50, label: 'R1' },
        ]}
        wires={[{ from: 'b', to: 'r' }]}
      />,
    );
    expect(container.querySelectorAll('.dg-cir-wire')).toHaveLength(1);
    expect(screen.getByText('9V')).toBeInTheDocument();
  });
});

describe('LabPanel', () => {
  it('flags out-of-range results and shows reference intervals', () => {
    render(
      <LabPanel
        title="Labs"
        results={[
          { name: 'Sleep', value: 5, unit: 'h', low: 7, high: 9 },
          { name: 'HR', value: 72, unit: 'bpm', low: 60, high: 100 },
        ]}
      />,
    );
    // Below-range sleep is flagged Low; in-range HR is not flagged.
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('7–9')).toBeInTheDocument();
  });
});
