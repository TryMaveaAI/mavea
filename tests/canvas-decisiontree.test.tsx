import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionTree } from '../src/canvas/blocks/flows/DecisionTree';
import type { DecisionNode } from '../src/canvas/blocks/flows/types';

// The old component rendered a single linear path and never showed branching. These tests lock
// the rebuild: BOTH the yes and no subtrees render (the decision space is visible), and each
// child carries its Yes/No edge label — i.e. it actually looks like a tree.
const nodes: DecisionNode[] = [
  { id: 'root', question: 'Is it raining?', yes: 'umbrella', no: 'sunny' },
  { id: 'umbrella', question: 'Heavy rain?', yes: 'stay', no: 'go' },
  { id: 'sunny', question: '', outcome: 'Go for a walk' },
  { id: 'stay', question: '', outcome: 'Stay inside' },
  { id: 'go', question: '', outcome: 'Bring a light jacket' },
];

describe('DecisionTree (Wave 1 rebuild)', () => {
  it('renders BOTH branches of the root, not just the chosen path', () => {
    render(<DecisionTree title="Plan" rootId="root" nodes={nodes} />);
    // The "no" subtree leaf is reachable in the DOM even though the default path follows "yes".
    expect(screen.getByText('Go for a walk')).toBeInTheDocument(); // root → no
    expect(screen.getByText('Heavy rain?')).toBeInTheDocument(); // root → yes child question
  });

  it('labels the connectors with Yes / No edges', () => {
    render(<DecisionTree title="Plan" rootId="root" nodes={nodes} />);
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No').length).toBeGreaterThan(0);
  });

  it('renders nested subtree leaves (real depth, not a flat list)', () => {
    render(<DecisionTree title="Plan" rootId="root" nodes={nodes} />);
    // Both grandchildren of the root via the "yes" branch are present.
    expect(screen.getByText('Stay inside')).toBeInTheDocument();
    expect(screen.getByText('Bring a light jacket')).toBeInTheDocument();
  });

  it('survives a cyclic reference without infinite recursion', () => {
    const cyclic: DecisionNode[] = [
      { id: 'a', question: 'A?', yes: 'b', no: 'b' },
      { id: 'b', question: 'B?', yes: 'a', no: 'a' },
    ];
    expect(() => render(<DecisionTree title="Loop" rootId="a" nodes={cyclic} />)).not.toThrow();
  });
});
