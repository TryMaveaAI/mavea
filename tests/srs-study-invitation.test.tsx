import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveApp } from '../src/live/LiveApp';
import { resetLiveConfig } from '../src/live/useLiveConfig';
import { saveSession, clearSession } from '../src/live/session/store';
import { getStudyPrefs, getStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { ConversationSpec, Block } from '../src/data/conversation';

// The one-time question. It fires at the first cards anyone ever saves — the single moment they've
// clearly shown they want to remember something — and then never again, in either direction. The
// rules it has to keep: asked once in the app's lifetime, both answers settle it, and a plain pile
// is what you get if you ignore it, because that's the option that asks nothing of you.

function priorSession(): void {
  const blocks: Block[] = [
    {
      type: 'flashcard',
      id: 'f1',
      col: 12,
      num: '1',
      props: {
        title: 'Key terms',
        cards: [
          { front: 'Amortization', back: 'Paying a debt down over time' },
          { front: 'Escrow', back: 'A third party holding funds' },
        ],
      },
    } as unknown as Block,
  ];
  const spec = {
    id: 's',
    workspace: 'W',
    title: 'Refinancing',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    topic: 'Refinancing',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
  const frame: TurnFrame = {
    question: 'How does refinancing work?',
    narration: 'About refinancing.',
    mode: 'replace',
    tour: [],
    spec,
    at: Date.now(),
  };
  const history: ChatMessage[] = [
    { role: 'user', content: 'How does refinancing work?' },
    { role: 'assistant', content: 'About refinancing.' },
  ];
  saveSession(history, [frame]);
}

/** Save cards off the answer the way a user does: the block's "Cards" pill, then Save. */
async function saveCardsFromBlock(container: HTMLElement): Promise<void> {
  // The block library loads in per-family chunks, so the first mount in a run pays for that.
  const cards = await waitFor(
    () => {
      const el = container.querySelector('.block-cards');
      if (!el) throw new Error('no Cards pill yet');
      return el;
    },
    { timeout: 5000 },
  );
  fireEvent.click(cards!);
  const save = await screen.findByRole('button', { name: /^(Save|Add \d+ cards|Add card)$/ });
  fireEvent.click(save);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetSrsCacheForTests();
  resetLiveConfig();
  clearSession();
  priorSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('the one-time study-style question', () => {
  it('appears on the first cards ever saved, and offers both answers', async () => {
    const { container } = render(<LiveApp />);
    await saveCardsFromBlock(container);

    const ask = await screen.findByText('Want Mavéa to help you remember these?');
    expect(ask).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    // It never speaks — it is a pill announced politely, not a voice line.
    expect(container.querySelector('.cards-pill.is-ask')).toHaveAttribute('aria-live', 'polite');
  });

  it('"Yes" turns on spaced study and settles the question for good', async () => {
    const { container } = render(<LiveApp />);
    await saveCardsFromBlock(container);

    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(getStudyStyle()).toBe('spaced'));
    expect(getStudyPrefs().styleAsked).toBe(true);
    expect(screen.queryByText('Want Mavéa to help you remember these?')).toBeNull();
  });

  it('"No thanks" leaves a plain pile, and is equally final', async () => {
    const { container } = render(<LiveApp />);
    await saveCardsFromBlock(container);

    fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
    await waitFor(() => expect(getStudyPrefs().styleAsked).toBe(true));
    expect(getStudyStyle()).toBe('collection');
  });

  it('never asks a second time — later saves get the plain confirmation instead', async () => {
    const { container } = render(<LiveApp />);
    await saveCardsFromBlock(container);
    fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
    await waitFor(() => expect(getStudyPrefs().styleAsked).toBe(true));

    // A second save from the same answer adds nothing new (dedup), so reach for a fresh one.
    vi.spyOn(Storage.prototype, 'setItem');
    await saveCardsFromBlock(container);
    expect(screen.queryByText('Want Mavéa to help you remember these?')).toBeNull();
  });

  it('does not ask an existing user who already has a graded collection', async () => {
    localStorage.setItem(
      'mavea-srs-v1',
      JSON.stringify({
        cards: [{ id: 'old', front: 'Q', back: 'A', interval: 6, easeFactor: 2.6, nextReview: 0 }],
      }),
    );
    __resetSrsCacheForTests();
    expect(getStudyPrefs().styleAsked).toBe(true);

    const { container } = render(<LiveApp />);
    await saveCardsFromBlock(container);
    expect(screen.queryByText('Want Mavéa to help you remember these?')).toBeNull();
  });
});
