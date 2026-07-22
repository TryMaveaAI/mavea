import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useCallback, useEffect, useState } from 'react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// The Live spotlight tour dims the canvas and lights one card at a time. It must never
// trap the user: clicking the dimmed area or pressing Esc releases the spotlight. This
// test reproduces LiveApp's exact dismiss wiring around the real TopicCanvas (which
// applies the .spotlit / .dimmed DOM), and locks the decision logic that is easy to get
// wrong — a click ON the spotlit card must NOT dismiss, a click on the dimmed backdrop
// or Esc MUST. (Full LiveApp needs the whole turn engine to reach a spotlit state, so we
// drive TopicCanvas directly with the same handlers.)
afterEach(cleanup);

function spec(): ConversationSpec {
  const blocks: Block[] = [
    { id: 'a', type: 'insight', col: 4, props: { title: 'First card' } } as unknown as Block,
    { id: 'b', type: 'insight', col: 4, props: { title: 'Second card' } } as unknown as Block,
  ];
  return {
    id: 'money',
    workspace: 'Test',
    title: 'T',
    sub: 'S',
    opener: '',
    context: [{ name: 'Source', color: 'var(--presence)' }],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

/** Mirrors LiveApp's canvas-scroll + dismiss handlers exactly. */
function Harness({ onDismiss }: { onDismiss: () => void }) {
  const [spot, setSpot] = useState<string | null>('a');
  const dismiss = useCallback(() => {
    if (!spot) return;
    setSpot(null);
    onDismiss();
  }, [spot, onDismiss]);
  useEffect(() => {
    if (!spot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spot, dismiss]);
  // Mirrors the target/backdrop check LiveApp uses: a click (or its keyboard equivalent) only
  // dismisses when it doesn't land on the spotlit card itself.
  const dismissIfOutsideSpotlight = (target: EventTarget | null): void => {
    if (!(target as HTMLElement).closest('.spotlit')) dismiss();
  };
  return (
    <div
      className="canvas-scroll"
      role="button"
      tabIndex={0}
      onClick={spot ? (e) => dismissIfOutsideSpotlight(e.target) : undefined}
      onKeyDown={
        spot
          ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              if (e.key === ' ') e.preventDefault();
              dismissIfOutsideSpotlight(e.target);
            }
          : undefined
      }
    >
      <TopicCanvas data={spec()} spot={spot} built={{}} onProve={() => {}} />
    </div>
  );
}

describe('Live spotlight — never traps the user', () => {
  it('clicking the dimmed backdrop releases the spotlight', () => {
    const onDismiss = vi.fn();
    const { container } = render(<Harness onDismiss={onDismiss} />);
    // A card is spotlit and another is dimmed.
    expect(container.querySelector('.spotlit')).toBeTruthy();
    expect(container.querySelector('.dimmed')).toBeTruthy();
    // Click the dimmed card (the backdrop, outside the spotlit one) → dismiss.
    fireEvent.click(container.querySelector('.dimmed')!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.spotlit')).toBeNull();
    expect(container.querySelector('.dimmed')).toBeNull();
  });

  it('clicking the spotlit card itself does NOT dismiss', () => {
    const onDismiss = vi.fn();
    const { container } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.click(container.querySelector('.spotlit')!);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(container.querySelector('.spotlit')).toBeTruthy();
  });

  it('pressing Escape releases the spotlight', () => {
    const onDismiss = vi.fn();
    const { container } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.spotlit')).toBeNull();
  });
});
