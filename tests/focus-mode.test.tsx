import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
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

// A tiny block factory — only the fields Focus mode reads (type/id) matter here.
function blk(type: string, id?: string, props: Record<string, unknown> = {}): Block {
  return { type, id, col: 6, props } as unknown as Block;
}

describe('useFocusMode store', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewMode('everything'); // reset the in-session cache to the default
    localStorage.clear();
  });

  it('defaults to the full grid (everything)', () => {
    expect(getViewMode()).toBe('everything');
  });

  it('persists the chosen mode to localStorage under the shared key', () => {
    setViewMode('focus');
    expect(getViewMode()).toBe('focus');
    expect(localStorage.getItem('mavea-view-mode')).toBe('focus');
  });

  it('ignores an invalid value', () => {
    setViewMode('focus');
    setViewMode('sideways' as ViewMode);
    expect(getViewMode()).toBe('focus');
  });

  it('broadcasts a CustomEvent on change so views re-read', () => {
    const onChange = vi.fn();
    window.addEventListener(VIEW_MODE_EVENT, onChange);
    setViewMode('focus');
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

// ---- TopicCanvas Focus-mode branch (the stage + filmstrip) ----
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

describe('TopicCanvas — Focus mode', () => {
  const three = () => [insight('a1', 'Alpha'), insight('b2', 'Beta'), insight('c3', 'Gamma')];

  it('renders the full grid (no stage) in everything mode, with the toggle offered', () => {
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="everything"
        onViewMode={() => {}}
      />,
    );
    expect(container.querySelector('.card-grid')).not.toBeNull();
    expect(container.querySelector('.focus-stage')).toBeNull();
    expect(container.querySelector('.focus-toggle')).not.toBeNull();
  });

  it('renders the stage + a filmstrip of every id-bearing card in focus mode', () => {
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
        onViewMode={() => {}}
      />,
    );
    expect(container.querySelector('.focus-stage')).not.toBeNull();
    expect(container.querySelector('.focus-hero')).not.toBeNull();
    expect(container.querySelector('.card-grid')).toBeNull();
    expect(container.querySelectorAll('.filmstrip-entry')).toHaveLength(3);
  });

  it('falls back to the grid (and hides the toggle) when only one card can hold the stage', () => {
    const oneId: Block[] = [
      insight('a1', 'Alpha'),
      { type: 'list', col: 12, props: { title: 'Notes', items: ['x'] } } as Block,
    ];
    const { container } = render(
      <TopicCanvas
        data={spec(oneId)}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
        onViewMode={() => {}}
      />,
    );
    expect(container.querySelector('.focus-stage')).toBeNull();
    expect(container.querySelector('.card-grid')).not.toBeNull();
    expect(container.querySelector('.focus-toggle')).toBeNull();
  });

  it('rests on the lead insight, then follows the conversation as spot moves', () => {
    const { container, rerender } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    const hero = () => container.querySelector('.focus-hero')?.textContent ?? '';
    expect(hero()).toContain('Alpha'); // default = lead insight

    rerender(
      <TopicCanvas data={spec(three())} spot="b2" built={{}} onProve={() => {}} viewMode="focus" />,
    );
    expect(hero()).toContain('Beta');

    rerender(
      <TopicCanvas data={spec(three())} spot="c3" built={{}} onProve={() => {}} viewMode="focus" />,
    );
    expect(hero()).toContain('Gamma');
  });

  it('captions the hero slide with the model note, and tracks it as the slide changes', () => {
    const noted = (id: string, title: string, note: string): Block => ({
      ...insight(id, title),
      note,
    });
    const blocks = [
      noted('a1', 'Alpha', 'Alpha sets the scene.'),
      noted('b2', 'Beta', 'Beta is the turning point.'),
    ];
    const { container, rerender } = render(
      <TopicCanvas
        data={spec(blocks)}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    const caption = () => container.querySelector('.focus-caption')?.textContent ?? '';
    expect(caption()).toBe('Alpha sets the scene.'); // default hero = lead

    rerender(
      <TopicCanvas data={spec(blocks)} spot="b2" built={{}} onProve={() => {}} viewMode="focus" />,
    );
    expect(caption()).toBe('Beta is the turning point.');
  });

  it('shows no caption when the hero slide has no model note', () => {
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    expect(container.querySelector('.focus-caption')).toBeNull();
  });

  it('shows a real card miniature in each filmstrip entry, not an icon', () => {
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    // The thumbnail mounts the genuine card component (.card), proving it is a live render.
    expect(container.querySelectorAll('.filmstrip-thumb .card').length).toBeGreaterThanOrEqual(1);
  });

  it('pins the hero on a filmstrip tap and keeps it pinned as spot moves, until a new answer', () => {
    const { container, rerender } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    const hero = () => container.querySelector('.focus-hero')?.textContent ?? '';

    const gammaEntry = Array.from(container.querySelectorAll<HTMLElement>('.filmstrip-entry')).find(
      (e) => e.textContent?.includes('Gamma'),
    )!;
    fireEvent.click(gammaEntry);
    expect(hero()).toContain('Gamma');

    // The background tour keeps moving spot — the pinned hero must not budge.
    rerender(
      <TopicCanvas data={spec(three())} spot="b2" built={{}} onProve={() => {}} viewMode="focus" />,
    );
    expect(hero()).toContain('Gamma');

    // A fresh answer (new spec id) re-arms the auto-follow → back to the resting lead insight.
    rerender(
      <TopicCanvas
        data={spec(three(), 't2')}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    expect(hero()).toContain('Alpha');
  });

  it('reports the chosen mode when the toggle is clicked', () => {
    const onViewMode = vi.fn();
    const { getByRole } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="everything"
        onViewMode={onViewMode}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Focus' }));
    expect(onViewMode).toHaveBeenCalledWith('focus');
  });

  it('asks the surface to narrate the card the user taps', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
        onNarrate={onNarrate}
      />,
    );
    const gamma = Array.from(container.querySelectorAll<HTMLElement>('.filmstrip-entry')).find(
      (e) => e.textContent?.includes('Gamma'),
    )!;
    fireEvent.click(gamma);
    expect(onNarrate).toHaveBeenCalledTimes(1);
    expect(onNarrate.mock.calls[0][0].id).toBe('c3'); // the tapped block
  });

  it('walks the rail with the arrow keys, pinning + narrating each card it lands on', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
        onNarrate={onNarrate}
      />,
    );
    const hero = () => container.querySelector('.focus-hero')?.textContent ?? '';
    const list = container.querySelector('.filmstrip-list')!;

    // From the resting lead insight (Alpha), ArrowDown moves to the next card.
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(onNarrate.mock.calls.at(-1)?.[0].id).toBe('b2');
    expect(hero()).toContain('Beta');

    // End jumps to the last card.
    fireEvent.keyDown(list, { key: 'End' });
    expect(onNarrate.mock.calls.at(-1)?.[0].id).toBe('c3');
    expect(hero()).toContain('Gamma');

    // Home returns to the first.
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onNarrate.mock.calls.at(-1)?.[0].id).toBe('a1');
    expect(hero()).toContain('Alpha');
  });

  it('marks the narrated card with a speaking cue on the hero and its rail entry', () => {
    const { container } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
        narratingId="a1"
      />,
    );
    expect(container.querySelector('.focus-speaking')).not.toBeNull();
    const activeEntry = container.querySelector('.filmstrip-entry.active');
    expect(activeEntry?.querySelector('.filmstrip-speaking')).not.toBeNull();
  });

  it('crossfades: the outgoing card lingers briefly as the hero swaps', () => {
    const { container, rerender } = render(
      <TopicCanvas
        data={spec(three())}
        spot={null}
        built={{}}
        onProve={() => {}}
        viewMode="focus"
      />,
    );
    rerender(
      <TopicCanvas data={spec(three())} spot="b2" built={{}} onProve={() => {}} viewMode="focus" />,
    );
    const out = container.querySelector('.focus-out');
    expect(out).not.toBeNull(); // the previous hero is still painted, fading out
    expect(out?.textContent).toContain('Alpha');
    expect(container.querySelector('.focus-in')?.textContent).toContain('Beta');
  });

  it('cuts instantly under reduced motion — no lingering outgoing layer', () => {
    const real = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    try {
      const { container, rerender } = render(
        <TopicCanvas
          data={spec(three())}
          spot={null}
          built={{}}
          onProve={() => {}}
          viewMode="focus"
        />,
      );
      rerender(
        <TopicCanvas
          data={spec(three())}
          spot="c3"
          built={{}}
          onProve={() => {}}
          viewMode="focus"
        />,
      );
      expect(container.querySelector('.focus-out')).toBeNull();
      expect(container.querySelector('.focus-in')?.textContent).toContain('Gamma');
    } finally {
      window.matchMedia = real;
    }
  });
});

// The outgoing swap card is an absolute, full-width overlay (focus.css). In Live, the ink layer
// needs the hero card to be a positioning context, but that anchor rule must NOT also drag the
// outgoing overlay back in-flow — or the flex `.focus-hero` splits the two cards 50/50 and every
// slide flashes at HALF WIDTH for the length of the crossfade (Live-only; Demo has no `.live-voice`).
describe('Focus swap — outgoing overlay stays out of flow (no half-width slide flash)', () => {
  const annotateCss = readFileSync(
    join(__dirname, '..', 'src', 'live', 'annotate', 'annotate.css'),
    'utf8',
  );

  it('scopes the live-voice ink-anchor to the active card, never the outgoing overlay', () => {
    // Must anchor the ACTIVE hero (.focus-in)…
    expect(annotateCss).toMatch(/\.live-voice\s+\.focus-hero-card\.focus-in/);
    // …and never the bare `.focus-hero-card` (which would tie .focus-out{position:absolute} on
    // specificity and win by cascade order, forcing the overlay in-flow → the half-width flash).
    expect(annotateCss).not.toMatch(/\.live-voice\s+\.focus-hero-card\s*[,{]/);
  });
});
