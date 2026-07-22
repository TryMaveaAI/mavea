import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CanvasTakeover } from '../src/canvas/focus/CanvasView';
import type { ConversationSpec, Block } from '../src/data/conversation';

// The Canvas view is a full-screen takeover: it portals to <body> (so no column or transform can
// clip the board), locks the page scroll behind it, and always offers one obvious way back —
// the header close and Escape. These pin that contract.

const blocks: Block[] = [
  { type: 'insight', id: 'a', num: '1', col: 6, props: { title: 'Alpha', summary: 'First card.' } },
  { type: 'insight', id: 'b', num: '2', col: 6, props: { title: 'Beta', summary: 'Second card.' } },
];

const data = {
  id: 'spec',
  title: 'A Board-Shaped Answer',
  sub: '',
  opener: '',
  context: [],
  blocks,
  topic: 'demo',
} as unknown as ConversationSpec;

function renderTakeover(onExit = vi.fn()) {
  const utils = render(
    <CanvasTakeover
      data={data}
      blocks={blocks}
      spot={null}
      renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      onExit={onExit}
    />,
  );
  return { onExit, ...utils };
}

describe('CanvasTakeover', () => {
  it('renders a full-screen dialog portalled to <body>, titled by the answer', () => {
    renderTakeover();
    const dialog = screen.getByRole('dialog', { name: /A Board-Shaped Answer — canvas/i });
    // Portalled out of the React root: the dialog's parent is the body itself.
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelector('.cv-viewport')).toBeTruthy();
  });

  it('locks page scroll while open and restores it on close', () => {
    const { unmount } = renderTakeover();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from the header button and from Escape on the board', () => {
    const { onExit } = renderTakeover();
    fireEvent.click(screen.getByRole('button', { name: /back to answer/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
    const viewport = document.body.querySelector('.cv-viewport') as HTMLElement;
    fireEvent.keyDown(viewport, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it("a node's Ask pins the block WITHOUT closing the board — asking about several things in a row used to force a full exit for each one", () => {
    const onExit = vi.fn();
    const onAskBlock = vi.fn();
    render(
      <CanvasTakeover
        data={data}
        blocks={blocks}
        spot={null}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        onAskBlock={onAskBlock}
        onExit={onExit}
      />,
    );
    const ask = document.body.querySelector('.cv-node-ask') as HTMLElement;
    expect(ask).toBeTruthy();
    fireEvent.click(ask);
    expect(onAskBlock).toHaveBeenCalledTimes(1);
    expect(onAskBlock.mock.calls[0][0].id).toBe('a');
    expect(onExit).not.toHaveBeenCalled();
  });

  it('shows a selection count and turns the close button into the "ask about them" action once something is pinned', () => {
    const onExit = vi.fn();
    render(
      <CanvasTakeover
        data={data}
        blocks={blocks}
        spot={null}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        onAskBlock={() => {}}
        onExit={onExit}
        selectedBlockIds={new Set(['a', 'b'])}
      />,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /ask about 2/i });
    fireEvent.click(cta);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('reads as a neutral "back to answer" when nothing is pinned', () => {
    renderTakeover();
    expect(screen.queryByText(/selected/i)).toBeNull();
    expect(screen.getByRole('button', { name: /back to answer/i })).toBeInTheDocument();
  });
});
