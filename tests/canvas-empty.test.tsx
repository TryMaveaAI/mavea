import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { hasData, magnitudeOf, resolvesDeclaredItems } from '../src/canvas/lib/empty';
import { BlockEmpty } from '../src/canvas/lib/BlockEmpty';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { ConversationSpec } from '../src/data/conversation';

describe('hasData', () => {
  it('is true when any finite number is present', () => {
    expect(hasData([1, 2, 3])).toBe(true);
    expect(hasData([null, undefined, 5])).toBe(true);
  });
  it('is false for empty / all-invalid input', () => {
    expect(hasData([])).toBe(false);
    expect(hasData([null, undefined])).toBe(false);
    expect(hasData([NaN, Infinity])).toBe(false);
  });
});

describe('BlockEmpty', () => {
  it('renders a status message and optional hint', () => {
    render(<BlockEmpty message="No data for this range" hint="Try a wider window" />);
    expect(screen.getByRole('status')).toHaveTextContent('No data for this range');
    expect(screen.getByText('Try a wider window')).toBeInTheDocument();
  });
  it('falls back to a default message', () => {
    render(<BlockEmpty />);
    expect(screen.getByRole('status')).toHaveTextContent('No data to show');
  });
});

describe('TopicCanvas empty answer', () => {
  it('shows a recovery path instead of an empty card grid', () => {
    const data: ConversationSpec = {
      id: 'live',
      workspace: 'Live',
      title: 'Answer',
      sub: '',
      opener: '',
      context: [],
      blocks: [],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    };
    const { container } = render(
      <TopicCanvas data={data} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Nothing usable to show');
    expect(container.querySelector('.card-grid')).toBeNull();
  });
});

// A figure sized from a number: five named layers with no usable thickness is a title over an empty
// stage — counted, captioned, blank. The catalog names the field (ItemSpec.magnitude) and the
// judgement below refuses the array the way it refuses a list of blank rows.
describe('magnitudes — items drawn from a number', () => {
  it('reads the leading number out of a model’s "12 km" and refuses zero, negatives and words', () => {
    expect(magnitudeOf(12)).toBe(12);
    expect(magnitudeOf('12 km')).toBe(12);
    expect(magnitudeOf(' 0.5mm')).toBe(0.5);
    expect(magnitudeOf('1,5')).toBe(1.5);
    expect(magnitudeOf(0)).toBeNull();
    expect(magnitudeOf(-3)).toBeNull();
    expect(magnitudeOf('thin')).toBeNull();
    expect(magnitudeOf(undefined)).toBeNull();
  });

  it('refuses a declared item array where no item carries its magnitude', () => {
    const shapes = [{ prop: 'layers', text: 'name', magnitude: 'thickness' }];
    expect(resolvesDeclaredItems({ layers: [{ name: 'Crust' }, { name: 'Mantle' }] }, shapes)).toBe(
      false,
    );
    expect(resolvesDeclaredItems({ layers: [{ name: 'Crust', thickness: 0 }] }, shapes)).toBe(
      false,
    );
    // One real thickness is enough — the renderer skips the rest.
    expect(
      resolvesDeclaredItems(
        { layers: [{ name: 'Crust' }, { name: 'Mantle', thickness: '2900 km' }] },
        shapes,
      ),
    ).toBe(true);
    // Absence is someone else's call, and a shape with no magnitude is untouched.
    expect(resolvesDeclaredItems({ layers: [] }, shapes)).toBe(true);
    expect(
      resolvesDeclaredItems({ layers: [{ name: 'Crust' }] }, [{ prop: 'layers', text: 'name' }]),
    ).toBe(true);
  });
});
