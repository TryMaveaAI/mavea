import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { TopicCanvas } from '../src/canvas/TopicCanvas';

// A "Go deeper" button is a promise of depth. When the drawer could not be written — the model
// was unreachable, or it answered with nothing usable — the reader used to get a drawer that
// opened and shut with no word, which read as the app ignoring the press and gave no way to tell
// a throttled key from an empty answer. The drawer now says which, and keeps the affordance.
const outcome = { current: { failed: 'request' } as { failed: string } | { blocks: Block[] } };
vi.mock('../src/live/depth/deepen', () => ({
  deepenSection: () => Promise.resolve(outcome.current),
}));
vi.mock('../src/live/depth/deepenStore', () => ({
  deepenOffered: () => true,
}));

function spec(blocks: Block[]): ConversationSpec {
  return {
    id: 't',
    workspace: 'T',
    title: 'T',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

const headline: Block = {
  type: 'insight',
  id: 'headline',
  col: 6,
  num: '1',
  section: 'Overview',
  order: 1,
  depth: 1,
  props: { title: 'Headline', summary: 'The gist.' },
} as Block;

describe('Go deeper — a drawer that could not be written says why', () => {
  it('names an unreachable model and offers the press again, with the button still armed', async () => {
    outcome.current = { failed: 'request' };
    render(<TopicCanvas data={spec([headline])} spot={null} built={{}} onProve={() => {}} />);
    const button = screen.getByRole('button', { name: /go deeper/i });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/couldn.t reach the model/i),
    );
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('tells an empty answer apart from a failed request', async () => {
    outcome.current = { failed: 'empty' };
    render(<TopicCanvas data={spec([headline])} spot={null} built={{}} onProve={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /go deeper/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/nothing more to add/i),
    );
  });
});
