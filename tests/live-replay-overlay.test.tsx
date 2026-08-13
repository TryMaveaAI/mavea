import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ReplayOverlay } from '../src/live/ReplayOverlay';
import type { TurnFrame } from '../src/live/history';
import type { Block, ConversationSpec } from '../src/data/conversation';

afterEach(cleanup);

const blk = (id: string, title: string): Block =>
  ({ type: 'insight', col: 12, delay: 0, id, props: { title } }) as unknown as Block;

const spec = (title: string, blocks: Block[]): ConversationSpec =>
  ({
    id: 'live',
    workspace: 'Live',
    title,
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  }) as unknown as ConversationSpec;

const frames: TurnFrame[] = [
  {
    question: 'what is jazz',
    narration: 'Jazz is improvised music.',
    mode: 'replace',
    tour: [],
    spec: spec('About jazz', [blk('live-1', 'Jazz basics')]),
    at: 1,
  },
  {
    question: 'who started it',
    narration: 'New Orleans, early 1900s.',
    mode: 'augment',
    tour: [],
    spec: spec('Jazz origins', [blk('live-2', 'New Orleans roots')]),
    at: 2,
  },
];

describe('ReplayOverlay — scroll back and replay', () => {
  it('lists every turn in the timeline and opens on the chosen frame', () => {
    render(<ReplayOverlay frames={frames} initialIndex={1} onClose={() => {}} />);
    // Both turns appear in the timeline (by their question).
    expect(screen.getByText(/what is jazz/i)).toBeInTheDocument();
    expect(screen.getByText(/who started it/i)).toBeInTheDocument();
    // The chosen frame's canvas is shown (its block title renders).
    expect(screen.getByText(/New Orleans roots/i)).toBeInTheDocument();
    // Replay controls are present.
    expect(screen.getByText(/Replay this/i)).toBeInTheDocument();
    expect(screen.getByText(/From here/i)).toBeInTheDocument();
    expect(screen.getByText(/From start/i)).toBeInTheDocument();
  });

  it('switches the shown canvas when another turn is clicked', () => {
    render(<ReplayOverlay frames={frames} initialIndex={1} onClose={() => {}} />);
    fireEvent.click(screen.getByTitle('what is jazz'));
    expect(screen.getByText(/Jazz basics/i)).toBeInTheDocument();
  });

  it('speaks the frame line when replaying one turn', () => {
    const speak = vi.fn();
    render(<ReplayOverlay frames={frames} initialIndex={0} speak={speak} onClose={() => {}} />);
    fireEvent.click(screen.getByText(/Replay this/i));
    expect(speak).toHaveBeenCalledWith('Jazz is improvised music.');
  });

  it('closes via the Live button', () => {
    const onClose = vi.fn();
    render(<ReplayOverlay frames={frames} initialIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByText(/← Live/i));
    expect(onClose).toHaveBeenCalled();
  });

  // It is a modal: one dialog announced to assistive tech (not a page-sized button wrapping every
  // control), and Escape gets a keyboard user back out of it.
  it('is a labelled modal dialog that closes on Escape', () => {
    const onClose = vi.fn();
    render(<ReplayOverlay frames={frames} initialIndex={0} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Replay' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // No wrapper pretending to be a button — the timeline buttons are the only buttons here.
    expect(screen.queryByRole('button', { name: /close replay overlay/i })).toBeNull();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
