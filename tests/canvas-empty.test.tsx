import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { hasData } from '../src/canvas/lib/empty';
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
