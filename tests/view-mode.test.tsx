import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  getViewMode,
  setViewMode,
  VIEW_MODE_EVENT,
  type ViewMode,
} from '../src/canvas/focus/useFocusMode';
import { defaultHeroId } from '../src/canvas/focus/heroSelect';
import { blockKind, blockNarration, speakableLine } from '../src/canvas/blockLabel';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// A tiny block factory — only the fields these helpers read (type/id) matter here.
function blk(type: string, id?: string, props: Record<string, unknown> = {}): Block {
  return { type, id, col: 6, props } as unknown as Block;
}

describe('useFocusMode store', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewMode('board'); // reset the in-session cache to the default
    localStorage.clear();
  });

  it('defaults to the board — a reader with no preference gets the whole answer', () => {
    expect(getViewMode()).toBe('board');
  });

  it.each(['room', 'study', 'focus', 'everything'])(
    'reads a retired %s preference as the board',
    async (stored) => {
      localStorage.setItem('mavea-view-mode', stored);
      // A fresh module instance, so the read really comes from storage rather than the
      // in-session cache the beforeEach just seeded.
      vi.resetModules();
      const fresh = await import('../src/canvas/focus/useFocusMode');
      expect(fresh.getViewMode()).toBe('board');
      // Migrated on read only — the stored value is never rewritten behind the user's back.
      expect(localStorage.getItem('mavea-view-mode')).toBe(stored);
    },
  );

  it('writes the board and nothing else — every other view is a takeover', () => {
    setViewMode('board');
    expect(localStorage.getItem('mavea-view-mode')).toBe('board');
    for (const takeover of ['study', 'canvas', 'world'] as const) {
      setViewMode(takeover);
      expect(getViewMode()).toBe(takeover); // shown this session…
      expect(localStorage.getItem('mavea-view-mode')).toBe('board'); // …never saved
    }
  });

  it('ignores an invalid value', () => {
    setViewMode('study');
    setViewMode('sideways' as ViewMode);
    expect(getViewMode()).toBe('study');
  });

  it('broadcasts a CustomEvent on change so views re-read', () => {
    const onChange = vi.fn();
    window.addEventListener(VIEW_MODE_EVENT, onChange);
    setViewMode('study');
    expect(onChange).toHaveBeenCalled();
    window.removeEventListener(VIEW_MODE_EVENT, onChange);
  });
});

describe('defaultHeroId', () => {
  it('prefers the lead insight', () => {
    const blocks = [blk('chart', 'c1'), blk('insight', 'i1'), blk('insight', 'i2')];
    expect(defaultHeroId(blocks)).toBe('i1');
  });

  it('falls back to the first id-bearing block when there is no insight', () => {
    const blocks = [blk('chart'), blk('bars', 'b1'), blk('scatter', 's1')];
    expect(defaultHeroId(blocks)).toBe('b1');
  });

  it('returns null when nothing is eligible', () => {
    expect(defaultHeroId([blk('chart'), blk('bars')])).toBeNull();
    expect(defaultHeroId([])).toBeNull();
  });
});

describe('blockKind', () => {
  it('gives insights the friendly "FINDING" eyebrow', () => {
    expect(blockKind(blk('insight', 'i1'))).toBe('FINDING');
  });

  it('uses a short uppercase noun, falling back to the friendly type name', () => {
    expect(blockKind(blk('scatter'))).toBe('SCATTER');
    expect(blockKind(blk('chart'))).toBe('CHART');
    expect(blockKind(blk('ring'))).toBe('STAT'); // via TYPE_NAMES
  });

  it('falls back to the raw type for an unknown kind', () => {
    expect(blockKind(blk('sparkstat'))).toBe('SPARKSTAT');
  });
});

describe('blockNarration', () => {
  it('speaks the heading plus a clause of the block’s own body', () => {
    const b = blk('insight', 'i1', {
      title: 'Late screens push you back',
      summary: 'About 40 minutes later.',
    });
    expect(blockNarration(b)).toBe('Late screens push you back. About 40 minutes later.');
  });

  it('speaks just the heading when there is no body', () => {
    expect(blockNarration(blk('bars', 'b1', { title: 'Costs by month' }))).toBe('Costs by month');
  });
});

describe('speakableLine', () => {
  it('returns the heading plus a body clause for a content card', () => {
    const b = blk('insight', 'i1', { title: 'Sleep debt is real', summary: 'You owe two hours.' });
    expect(speakableLine(b)).toBe('Sleep debt is real. You owe two hours.');
  });

  it('returns just the heading when the card has one but no body', () => {
    expect(speakableLine(blk('bars', 'b1', { title: 'Costs by month' }))).toBe('Costs by month');
  });

  it('returns the body alone when the card has text but no heading', () => {
    expect(speakableLine(blk('quotes', 'q1', { text: 'The best way out is through.' }))).toBe(
      'The best way out is through.',
    );
  });

  it('returns null for a content-less card (no real heading or body)', () => {
    // A bare viz with no title/body would otherwise narrate a lone "Map"/"Chart" — we stay silent.
    expect(speakableLine(blk('map', 'm1'))).toBeNull();
    expect(speakableLine(blk('chart', 'c1', { series: [1, 2, 3] }))).toBeNull();
  });
});

// ---- TopicCanvas on the board ----
function insight(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    col: 12,
    num: '1',
    props: { title, summary: 's', conf: 'inferred' },
  } as Block;
}
function spec(blocks: Block[], id = 't'): ConversationSpec {
  return {
    id,
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
  } as unknown as ConversationSpec;
}

describe('TopicCanvas — the board', () => {
  const three = () => [insight('a1', 'Alpha'), insight('b2', 'Beta'), insight('c3', 'Gamma')];

  it('renders the full grid (no stage) on the board, with the door to the desk offered', () => {
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="board"
        onViewMode={() => {}}
      />,
    );
    expect(container.querySelector('.card-grid')).not.toBeNull();
    expect(container.querySelector('.guide-me')).not.toBeNull();
    // The board is where the canvas rests: no view switch to read, and nothing to exit.
    expect(container.querySelector('.focus-toggle')).toBeNull();
    expect(container.querySelector('.study-exit')).toBeNull();
  });

  it('asks for the desk when the board’s one door is clicked', () => {
    const onViewMode = vi.fn();
    const { getByRole } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="board"
        onViewMode={onViewMode}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Guide me/ }));
    expect(onViewMode).toHaveBeenCalledWith('study');
  });
});

describe('the board is where every visit starts', () => {
  it('rests on the board after a reload, whatever takeover was last on screen', async () => {
    localStorage.clear();
    vi.resetModules();
    const first = await import('../src/canvas/focus/useFocusMode');
    expect(first.getViewMode()).toBe('board');
    first.setViewMode('study'); // a takeover of one answer, not a preference

    // A new session reads the same storage with an empty in-session cache.
    vi.resetModules();
    const later = await import('../src/canvas/focus/useFocusMode');
    expect(later.getViewMode()).toBe('board');
  });

  it('never persists a per-answer takeover over the standing choice', async () => {
    localStorage.clear();
    vi.resetModules();
    const m = await import('../src/canvas/focus/useFocusMode');
    m.setViewMode('board');
    // Every one of these is about ONE answer — the desk, the spatial canvas and the causal world.
    for (const takeover of ['study', 'canvas', 'world'] as const) {
      m.setViewMode(takeover);
      expect(localStorage.getItem('mavea-view-mode')).toBe('board');
      expect(m.savedViewMode()).toBe('board');
    }
  });
});
