import { render } from '@testing-library/react';
import { SequenceDiagram } from '../src/canvas/blocks/diagrams/SequenceDiagram';
import { StateMachine } from '../src/canvas/blocks/diagrams/StateMachine';

// An SVG <marker id> must be unique in the document: url(#id) resolves to the FIRST match, so two
// diagrams sharing a hardcoded id cross-reference each other's arrowheads — and if the first
// unmounts, the survivor's arrows lose their markers. Each marker-using block derives its id from
// useId(), so two instances on one canvas must never collide.
function markerIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('marker')).map((m) => m.id);
}

describe('SVG marker id uniqueness', () => {
  it('SequenceDiagram gives each instance a distinct arrow marker id', () => {
    const props = {
      title: 'Seq',
      actors: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      messages: [{ from: 'a', to: 'b', label: 'ping' }],
    };
    const { container } = render(
      <>
        <SequenceDiagram {...props} />
        <SequenceDiagram {...props} />
      </>,
    );
    const ids = markerIds(container);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('StateMachine gives each instance a distinct arrow marker id', () => {
    const props = {
      title: 'SM',
      states: [
        { id: 's0', label: 'Start', start: true },
        { id: 's1', label: 'End', final: true },
      ],
      transitions: [{ from: 's0', to: 's1', label: 'go' }],
    };
    const { container } = render(
      <>
        <StateMachine {...props} />
        <StateMachine {...props} />
      </>,
    );
    const ids = markerIds(container);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
