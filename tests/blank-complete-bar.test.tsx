import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Blank, ConversationSpec, FillValue } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// The "Complete the answer" bar is the finish affordance for "The Blank Space" — and the ONLY
// finish: an answer never submits itself, however many holes are filled. It must always tell the
// user where they stand and what to do next — and never strand them. These lock the four honest
// states (nudge / progress / all-filled-ready / completing) and the Live-only gating, so a fill
// flow can never leave the user staring at filled holes with no idea how the answer finishes.

const blanks: Blank[] = [
  { key: 'a', label: 'A', prompt: 'pa', kind: 'text' },
  { key: 'b', label: 'B', prompt: 'pb', kind: 'text' },
];

function spec(over: Partial<ConversationSpec> = {}): ConversationSpec {
  return {
    id: 't',
    workspace: 'T',
    title: 'T',
    sub: '',
    opener: '',
    context: [],
    blocks: [],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
    awaiting: true,
    blanks,
    ...over,
  } as ConversationSpec;
}

const fill = (key: string): FillValue => ({ kind: 'text', key, value: 'x' });

describe('TopicCanvas — the "Complete the answer" bar', () => {
  it('is absent in the Demo (no blankFill wired)', () => {
    const { container } = render(
      <TopicCanvas data={spec()} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelector('.blank-complete-bar')).toBeNull();
  });

  it('is absent when the answer is not awaiting input', () => {
    const { container } = render(
      <TopicCanvas
        data={spec({ awaiting: false })}
        spot={null}
        built={{}}
        onProve={() => {}}
        blankFill={{ values: {}, activeKey: null, fill: vi.fn(), complete: vi.fn() }}
      />,
    );
    expect(container.querySelector('.blank-complete-bar')).toBeNull();
  });

  it('nudges and disables Complete when nothing is filled yet', () => {
    const { container, getByText, getByRole } = render(
      <TopicCanvas
        data={spec()}
        spot={null}
        built={{}}
        onProve={() => {}}
        blankFill={{ values: {}, activeKey: 'a', fill: vi.fn(), complete: vi.fn() }}
      />,
    );
    expect(container.querySelector('.blank-complete-bar')).not.toBeNull();
    getByText('Fill the blanks above to finish');
    expect(
      (getByRole('button', { name: 'Complete the answer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows progress and lets Complete fire once a hole is filled', () => {
    const complete = vi.fn();
    const { getByText, getByRole } = render(
      <TopicCanvas
        data={spec()}
        spot={null}
        built={{}}
        onProve={() => {}}
        blankFill={{ values: { a: fill('a') }, activeKey: 'b', fill: vi.fn(), complete }}
      />,
    );
    getByText('1 of 2 filled');
    const btn = getByRole('button', { name: 'Complete the answer' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('flips to the ready state when every hole is filled — and still waits for the click', () => {
    const complete = vi.fn();
    const { container, getByText, getByRole } = render(
      <TopicCanvas
        data={spec()}
        spot={null}
        built={{}}
        onProve={() => {}}
        blankFill={{
          values: { a: fill('a'), b: fill('b') },
          activeKey: null,
          fill: vi.fn(),
          complete,
        }}
      />,
    );
    getByText('All filled — finish when ready');
    expect(container.querySelector('.blank-complete-bar.is-ready')).not.toBeNull();
    // Nothing fired on its own — completion is the user's click.
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Complete the answer' }));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('shows a completing state with a spinner while the refine runs', () => {
    const { container, getByText, getByRole } = render(
      <TopicCanvas
        data={spec()}
        spot={null}
        built={{}}
        onProve={() => {}}
        blankFill={{
          values: { a: fill('a'), b: fill('b') },
          activeKey: null,
          fill: vi.fn(),
          complete: vi.fn(),
          busy: true,
        }}
      />,
    );
    getByText('Completing your answer…');
    expect(container.querySelector('.blank-complete-bar.is-busy')).not.toBeNull();
    expect(container.querySelector('.blank-complete-spinner')).not.toBeNull();
    // Busy must not allow a second completion to fire.
    expect(
      (getByRole('button', { name: 'Complete the answer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
