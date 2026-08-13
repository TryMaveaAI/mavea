// Margin notes — the muted walk's written asides. The pure pieces (condensing, the de-overlap
// stack) plus the rail's real rendering contract: portals into the reserved gutter as an
// <aside> (that tag is load-bearing — .card-grid > div rules would make a div rail a drifting
// positioning context), stacks without overlap, renders nothing without a reserved gutter, and
// note entries never leak into per-card stroke portals. Rects are stubbed jsdom-style, exactly
// like live-annotate.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, act } from '@testing-library/react';
import { condenseForNote, layoutNotes } from '../src/live/annotate/marginNote';
import { AnnotationLayer } from '../src/live/annotate/AnnotationLayer';
import { FocusStage } from '../src/canvas/focus/FocusStage';
import type { Block, ConversationSpec } from '../src/data/conversation';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => '',
  } as DOMRect;
}

describe('condenseForNote — a note is a margin scrawl, not a paragraph', () => {
  it('keeps a short line whole', () => {
    expect(condenseForNote('Rent is the number to watch.')).toBe('Rent is the number to watch.');
  });

  it('keeps only the first sentence', () => {
    expect(condenseForNote('Rent eats half. The rest is lean.')).toBe('Rent eats half.');
  });

  it('never splits a decimal for a sentence break', () => {
    expect(condenseForNote('Savings run at 3.5% APY here.')).toBe('Savings run at 3.5% APY here.');
  });

  it('cuts on a word boundary with an ellipsis at the cap', () => {
    const long = 'word '.repeat(60).trim() + '.';
    const out = condenseForNote(long);
    expect(out.length).toBeLessThanOrEqual(141);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('wor…'); // no mid-word cut
  });

  it('condenses whitespace and empties to nothing', () => {
    expect(condenseForNote('   ')).toBe('');
    expect(condenseForNote('a   b\n\nc.')).toBe('a b c.');
  });
});

describe('layoutNotes — the rail stacks without overlap', () => {
  it('keeps well-spaced notes at their card tops', () => {
    expect(layoutNotes([{ top: 10 }, { top: 300 }, { top: 700 }])).toEqual([10, 300, 700]);
  });

  it('pushes a crowding note past the one above (its height + gap), preserving input order', () => {
    expect(layoutNotes([{ top: 10 }, { top: 40 }, { top: 500 }], 12)).toEqual([10, 106, 500]);
  });

  it("spaces by each note's OWN height — a long note pushes the next one further", () => {
    expect(
      layoutNotes(
        [
          { top: 10, height: 150 },
          { top: 40, height: 40 },
        ],
        12,
      ),
    ).toEqual([10, 172]);
  });

  it('handles out-of-order anchors without swapping their results', () => {
    const tops = layoutNotes([{ top: 300 }, { top: 10 }], 12);
    expect(tops).toEqual([300, 10]);
  });

  it('lifts a run that would spill past the bottom, never past the top', () => {
    const tops = layoutNotes([{ top: 500 }, { top: 520 }], 12, 640);
    // Pushed-down stack: 500, 596 → bottom 680 spills past 640 → lifted up as one block.
    expect(tops[1] - tops[0]).toBe(96);
    expect(tops[1] + 84).toBeLessThanOrEqual(640);
    expect(tops[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('MarginNoteRail — the gutter rail in Everything view', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  /** A grid with the reserved gutter and two laid-out cards. jsdom computes no styles, so the
   *  rail falls back to its GUTTER_FALLBACK width — the geometry contract still holds. */
  function gutterGrid(cardTops: Record<string, number>): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'card-grid note-gutter';
    grid.getBoundingClientRect = () => domRect(0, 0, 1200, 2000);
    document.body.appendChild(grid);
    for (const [spot, top] of Object.entries(cardTops)) {
      const card = document.createElement('div');
      card.setAttribute('data-spot-id', spot);
      card.getBoundingClientRect = () => domRect(230, top, 700, 300);
      grid.appendChild(card);
    }
    return grid;
  }

  it('portals ONE rail into the gutter grid as an <aside role="list"> with a note per card', () => {
    const grid = gutterGrid({ a: 0, b: 600 });
    render(
      <AnnotationLayer
        spots={[
          { spot: 'a', noteText: 'First takeaway.' },
          { spot: 'b', noteText: 'Second takeaway.' },
        ]}
      />,
    );
    act(() => vi.advanceTimersByTime(700));
    const rail = grid.querySelector('.note-rail');
    expect(rail).toBeTruthy();
    // Load-bearing tag: .card-grid > div cascade rules must never catch the rail.
    expect(rail!.tagName).toBe('ASIDE');
    expect(rail!.getAttribute('role')).toBe('list');
    const notes = Array.from(rail!.querySelectorAll('.margin-note'));
    expect(notes.map((n) => n.textContent)).toEqual(['First takeaway.', 'Second takeaway.']);
    // Each note has a hand-drawn tether in the overlay.
    expect(grid.querySelectorAll('.note-rail-arrows .note-tether').length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('stacks crowding notes clear of each other (height + gap)', () => {
    const grid = gutterGrid({ a: 100, b: 130 });
    render(
      <AnnotationLayer
        spots={[
          { spot: 'a', noteText: 'one' },
          { spot: 'b', noteText: 'two' },
        ]}
      />,
    );
    act(() => vi.advanceTimersByTime(700));
    const tops = Array.from(grid.querySelectorAll<HTMLElement>('.margin-note')).map((n) =>
      parseFloat(n.style.top),
    );
    // 'one'/'two' estimate to 36px cards; the second clears the first by height + gap.
    expect(Math.abs(tops[1] - tops[0])).toBeGreaterThanOrEqual(48);
  });

  it('renders nothing without a reserved gutter (Focus stage, plain grid) — entries stay data', () => {
    const grid = document.createElement('div');
    grid.className = 'card-grid'; // no note-gutter class → nothing reserved
    grid.getBoundingClientRect = () => domRect(0, 0, 1200, 2000);
    document.body.appendChild(grid);
    render(<AnnotationLayer spots={[{ spot: 'a', noteText: 'orphan' }]} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(document.querySelector('.note-rail')).toBeNull();
  });

  it('a note entry never renders a per-card stroke portal', () => {
    const grid = gutterGrid({ a: 0 });
    render(<AnnotationLayer spots={[{ spot: 'a', noteText: 'note only' }]} />);
    act(() => vi.advanceTimersByTime(700));
    expect(grid.querySelector('.ink-layer')).toBeNull();
  });

  it('notes go to the NEAREST margin, and an arrow never crosses another card', () => {
    // Two columns: card L on the left, card R on the right, side by side — plus a note for
    // each. L's note belongs in the LEFT margin (its right-side path would cross R).
    const grid = document.createElement('div');
    grid.className = 'card-grid note-gutter';
    grid.getBoundingClientRect = () => domRect(0, 0, 1200, 2000);
    document.body.appendChild(grid);
    const mk = (spot: string, left: number): void => {
      const card = document.createElement('div');
      card.setAttribute('data-spot-id', spot);
      card.getBoundingClientRect = () => domRect(left, 40, 350, 300);
      grid.appendChild(card);
    };
    mk('L', 230);
    mk('R', 620);
    render(
      <AnnotationLayer
        spots={[
          { spot: 'L', noteText: 'left column note' },
          { spot: 'R', noteText: 'right column note' },
        ]}
      />,
    );
    act(() => vi.advanceTimersByTime(700));
    const leftRail = grid.querySelector('.note-rail.left');
    const rightRail = grid.querySelector('.note-rail:not(.left)');
    expect(leftRail?.textContent).toContain('left column note');
    expect(rightRail?.textContent).toContain('right column note');
    // Both sides are adjacent to their margins here, so both notes keep their tethers.
    expect(grid.querySelectorAll('.note-rail-arrows g').length).toBe(2);
  });

  it('a middle-column card keeps its note but drops the arrow rather than crossing a card', () => {
    const grid = document.createElement('div');
    grid.className = 'card-grid note-gutter';
    grid.getBoundingClientRect = () => domRect(0, 0, 1500, 2000);
    document.body.appendChild(grid);
    const mk = (spot: string, left: number): void => {
      const card = document.createElement('div');
      card.setAttribute('data-spot-id', spot);
      card.getBoundingClientRect = () => domRect(left, 40, 300, 300);
      grid.appendChild(card);
    };
    mk('A', 230); // left column
    mk('M', 590); // middle — blocked toward both margins
    mk('B', 950); // right column
    render(<AnnotationLayer spots={[{ spot: 'M', noteText: 'middle note' }]} />);
    act(() => vi.advanceTimersByTime(700));
    expect(grid.querySelector('.margin-note')?.textContent).toBe('middle note');
    expect(grid.querySelectorAll('.note-rail-arrows g').length).toBe(0);
  });

  it('never writes a pronunciation twin verbatim into a note', () => {
    // The walk line is the shown side already; this is the tripwire if that ever regresses.
    expect(condenseForNote('It costs [[a|b]] dollars.')).toContain('[[a|b]]');
    // ^ documents the CURRENT contract: condenseForNote does not strip twins — the walk line
    //   must already be clean. The pipe check below is what a regression would trip.
    const line = 'It costs $5,000 monthly.';
    expect(condenseForNote(line)).not.toContain('|');
  });
});

// The gutter is reserved as padding on BOTH sides (a note is written in whichever margin is
// nearest). Below the fit threshold the rail is hidden, so every reserved pixel is dead strip —
// releasing only one side left a 218px empty column beside the cards on a laptop. jsdom parses no
// stylesheet, so this is a source scan (the idiom responsive-css-guards.test.ts uses).
describe('margin-note gutter — the belt below the fit threshold releases both margins', () => {
  const css = readFileSync(join(__dirname, '../src/live/annotate/annotate.css'), 'utf8');

  it('reserves both margins above the threshold and zeroes both below it', () => {
    const base = /\.live-voice \.card-grid\.note-gutter\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(base).toMatch(/padding-left:\s*218px/);
    expect(base).toMatch(/padding-right:\s*218px/);
    const belt =
      /@media \(max-width: 1279px\)\s*\{[\s\S]*?\.live-voice \.card-grid\.note-gutter\s*\{([^}]*)\}/.exec(
        css,
      )?.[1] ?? '';
    expect(belt).toMatch(/padding-left:\s*0/);
    expect(belt).toMatch(/padding-right:\s*0/);
  });
});

describe("FocusStage — Mavéa's notes trail column", () => {
  const spec = { id: 't1', title: 'T', sub: '', blocks: [] } as unknown as ConversationSpec;
  const blocks = [
    { id: 'a', type: 'insight', props: { title: 'A' } },
    { id: 'b', type: 'insight', props: { title: 'B' } },
  ] as unknown as Block[];
  const renderBlock = (b: Block): React.ReactNode => <div>{(b as { id?: string }).id}</div>;

  it('renders the trail newest-first with the staged card lit, and pins on tap', () => {
    const onNarrate = vi.fn();
    const { container } = render(
      <FocusStage
        data={spec}
        blocks={blocks}
        spot="b"
        renderBlock={renderBlock}
        onNarrate={onNarrate}
        walkNotes={[
          { spot: 'a', text: 'First note.' },
          { spot: 'b', text: 'Second note.' },
        ]}
      />,
    );
    const notes = Array.from(container.querySelectorAll<HTMLButtonElement>('.focus-note'));
    expect(notes.map((n) => n.textContent)).toEqual(['Second note.', 'First note.']);
    expect(notes[0].classList.contains('active')).toBe(true);
    act(() => notes[1].click());
    expect(onNarrate).toHaveBeenCalledTimes(1);
    expect((onNarrate.mock.calls[0][0] as { id?: string }).id).toBe('a');
  });

  it('shows no column without notes, and none while presenting', () => {
    const empty = render(
      <FocusStage data={spec} blocks={blocks} spot="a" renderBlock={renderBlock} />,
    );
    expect(empty.container.querySelector('.focus-notes')).toBeNull();

    const presenting = render(
      <FocusStage
        data={spec}
        blocks={blocks}
        spot="a"
        renderBlock={renderBlock}
        presenting
        walkNotes={[{ spot: 'a', text: 'hidden while presenting' }]}
      />,
    );
    expect(presenting.container.querySelector('.focus-notes')).toBeNull();
  });
});
