import { render, fireEvent } from '@testing-library/react';
import { MemoryFactRow } from '../src/live/memory/MemoryFactRow';
import { mergeNodes, getMemoryNodes, forgetAll } from '../src/live/memory/store';

beforeEach(() => forgetAll());

describe('MemoryFactRow — edit a stored fact', () => {
  it('shows the body, then lets the user correct it (persists via editNode)', () => {
    const node = mergeNodes([{ concept: 'profile', body: 'Founder in Austin.' }])[0];
    const { getByText, getByLabelText, queryByLabelText } = render(
      <ul>
        <MemoryFactRow node={node} ago="now" />
      </ul>,
    );
    expect(getByText('Founder in Austin.')).toBeInTheDocument();

    fireEvent.click(getByText('Edit'));
    const ta = getByLabelText('Edit memory: profile') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Founder in NYC now.' } });
    fireEvent.click(getByText('Save'));

    // The store reflects the correction (recency/accuracy: fix a stale fact, not just delete it).
    expect(getMemoryNodes().find((n) => n.id === node.id)?.body).toBe('Founder in NYC now.');
    // and the row left edit mode (the parent re-feeds the updated node in the live app).
    expect(queryByLabelText('Edit memory: profile')).toBeNull();
  });

  it('cancel discards the edit', () => {
    const node = mergeNodes([{ concept: 'topic', body: 'Likes maps.' }])[0];
    const { getByText, getByLabelText } = render(
      <ul>
        <MemoryFactRow node={node} ago="now" />
      </ul>,
    );
    fireEvent.click(getByText('Edit'));
    fireEvent.change(getByLabelText('Edit memory: topic'), { target: { value: 'changed' } });
    fireEvent.click(getByText('Cancel'));
    expect(getMemoryNodes().find((n) => n.id === node.id)?.body).toBe('Likes maps.');
  });
});
