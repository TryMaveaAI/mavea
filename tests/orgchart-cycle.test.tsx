import { render } from '@testing-library/react';
import { OrgChart } from '../src/canvas/blocks/flows/OrgChart';
import type { OrgChartProps } from '../src/canvas/blocks/flows/types';

describe('OrgChart', () => {
  it('renders a normal tree', () => {
    const { getByText } = render(
      <OrgChart
        title="Team"
        rootId="a"
        nodes={[
          { id: 'a', name: 'Ada', children: ['b'] },
          { id: 'b', name: 'Bo' },
        ]}
      />,
    );
    expect(getByText('Ada')).toBeInTheDocument();
    expect(getByText('Bo')).toBeInTheDocument();
  });

  it('does not hang on a cycle in the children graph', () => {
    // The model can emit a cycle (a → b → a) or a self-referencing node; without a visited
    // guard the recursive render would overflow the stack and freeze the tab.
    const nodes: OrgChartProps['nodes'] = [
      { id: 'a', name: 'Ada', children: ['b'] },
      { id: 'b', name: 'Bo', children: ['a'] }, // cycle back to the root
      { id: 'c', name: 'Cy', children: ['c'] }, // self-reference
    ];
    expect(() => render(<OrgChart title="Org" rootId="a" nodes={nodes} />)).not.toThrow();
  });
});
