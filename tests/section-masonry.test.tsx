// On an ultrawide window a sectioned answer sits two abreast. Paired row by row, a tall section
// left a hole under the short one beside it as deep as the difference; packed, each section drops
// into whichever column is shorter, the cards in a section stack short beside tall, and both
// columns end on one line. jsdom has no layout, so heights are stubbed and the placement is read
// back off the custom properties Live's sheet lays the grid out by.
import { render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushSections,
  packCells,
  placeSections,
  useSectionMasonry,
} from '../src/canvas/depth/useSectionMasonry';

describe('placeSections', () => {
  it('sends each section, in order, to the shorter column', () => {
    // A tall first section: the second pairs beside it, then the third and fourth stack under the
    // SECOND rather than opening a row below the first.
    const p = placeSections([900, 200, 300, 250], 40);
    expect(p.map((s) => s.column)).toEqual([0, 1, 1, 1]);
    expect(p[2].row).toBe(p[1].row + p[1].span + 40);
    expect(p[3].row).toBe(p[2].row + p[2].span + 40);
  });

  it('breaks a tie to the left, so the first two still read left then right', () => {
    expect(placeSections([300, 300, 300], 32).map((s) => s.column)).toEqual([0, 1, 0]);
  });

  it('spans each section its own height, never less than a row', () => {
    const [a, b] = placeSections([412.4, 0], 32);
    expect(a.span).toBe(413);
    expect(b.span).toBe(1);
  });

  it('lands every section on a whole row, whatever the gap resolves to', () => {
    // A clamp()ed gutter resolves to fractions of a pixel, and a fractional line number is not a
    // line: the section falls back to auto placement at the top of the board.
    for (const s of placeSections([120, 80, 90, 60], 41.96))
      expect(Number.isInteger(s.row)).toBe(true);
    for (const c of packCells(
      [
        { tracks: 6, height: 50 },
        { tracks: 6, height: 20 },
        { tracks: 6, height: 20 },
      ],
      17.3,
    ))
      expect(Number.isInteger(c.row)).toBe(true);
  });
});

describe('flushSections', () => {
  it('shares the short column’s slack across its sections so both columns end on one line', () => {
    const places = placeSections([900, 200, 300, 250], 40);
    const flush = flushSections(places);
    const bottom = (i: number) => flush[i].row - 1 + places[i].span + flush[i].grow;
    // Left: 900. Right: 200 + 40 + 300 + 40 + 250 = 830, so its three sections share the 70.
    expect(flush.map((f) => f.grow)).toEqual([0, 18, 28, 24]);
    expect(bottom(0)).toBe(bottom(3));
    // Each section moves down by what the ones above it grew, so the gutters stay 40.
    expect(flush[2].row).toBe(bottom(1) + 40 + 1);
    expect(flush[3].row).toBe(bottom(2) + 40 + 1);
  });

  it('leaves columns that already end together alone', () => {
    expect(flushSections(placeSections([300, 300], 20))).toEqual([
      { row: 1, grow: 0 },
      { row: 1, grow: 0 },
    ]);
  });
});

describe('packCells', () => {
  it('stacks short cards beside a tall one instead of opening a row under it', () => {
    const p = packCells(
      [
        { tracks: 8, height: 400 },
        { tracks: 4, height: 100 },
        { tracks: 4, height: 120 },
      ],
      20,
    );
    expect(p.map((c) => [c.column, c.row])).toEqual([
      [1, 1],
      [9, 1],
      [9, 121],
    ]);
  });

  it('gives the space nothing else can use to the card above it, down to the floor', () => {
    const p = packCells(
      [
        { tracks: 6, height: 100 },
        { tracks: 6, height: 300 },
        { tracks: 12, height: 50 },
      ],
      20,
    );
    // The short half grows to its tall neighbour, so the full-width card sits on a clean line.
    expect(p[0].span).toBe(300);
    expect(p[2].row).toBe(321);
    // A card with a card under it grows only to the gap above that card.
    const q = packCells(
      [
        { tracks: 8, height: 400 },
        { tracks: 4, height: 100 },
        { tracks: 4, height: 120 },
      ],
      20,
    );
    expect(q[1].span).toBe(100);
    expect(q[2].row - 1 + q[2].span).toBe(400);
  });

  it('carries a section’s flush extra down to its bottom cards', () => {
    const p = packCells(
      [
        { tracks: 6, height: 100 },
        { tracks: 6, height: 140 },
      ],
      20,
      60,
    );
    expect(p.map((c) => c.span)).toEqual([200, 200]);
  });

  it('keeps reading order: no card is placed above one that came before it in its tracks', () => {
    const cells = [5, 7, 4, 4, 4, 12, 3, 9].map((tracks, i) => ({
      tracks,
      height: 80 + ((i * 53) % 170),
    }));
    const p = packCells(cells, 16);
    p.forEach((a, i) =>
      p.slice(i + 1).forEach((b) => {
        const shares = b.column < a.column + a.tracks && a.column < b.column + b.tracks;
        if (shares) expect(b.row).toBeGreaterThan(a.row);
      }),
    );
  });
});

describe('useSectionMasonry', () => {
  let wide = true;
  let listeners: (() => void)[] = [];
  let observed = 0;

  beforeEach(() => {
    wide = true;
    listeners = [];
    observed = 0;
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return wide && query === '(width >= 2560px)';
      },
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: (_: string, cb: () => void) =>
        (listeners = listeners.filter((l) => l !== cb)),
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          observed += 1;
        }
        disconnect(): void {
          observed = 0;
        }
        unobserve(): void {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    // A layout height: the stubbed content height, never the stretch the hook wrote.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return Number(this.dataset.h ?? 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function Board({
    heights,
    cards,
    active = true,
  }: {
    heights: number[];
    cards?: [number, number][];
    active?: boolean;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    useSectionMasonry(ref, active);
    return (
      <div className="card-grid" ref={ref} data-testid="grid">
        {heights.map((h, i) => (
          <section key={i} className="depth-section" data-h={h} data-testid={`s${i}`}>
            {i === 0 && cards && (
              <div className="card-grid" data-testid="inner">
                {cards.map(([tracks, ch], j) => (
                  <div
                    key={j}
                    className={`col-${tracks} askable`}
                    data-h={ch}
                    data-testid={`c${j}`}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    );
  }

  const placed = (el: HTMLElement) => ({
    col: el.style.getPropertyValue('--masonry-col'),
    row: el.style.getPropertyValue('--masonry-row'),
    span: el.style.getPropertyValue('--masonry-span'),
  });

  it('packs the sections and marks the grid at the two-abreast rung', () => {
    const { getByTestId } = render(<Board heights={[900, 200, 300]} />);
    expect(getByTestId('grid').hasAttribute('data-masonry')).toBe(true);
    expect(placed(getByTestId('s0')).col).toBe('1');
    expect(placed(getByTestId('s1')).col).toBe('7');
    // The third drops under the short second, not into a new row under the tall first, and the
    // right column's two sections share the growth to end level with the left one: 400 of slack,
    // 160 to the 200-tall second, which pushes the third down by that much.
    expect(placed(getByTestId('s2')).col).toBe('7');
    expect(placed(getByTestId('s1')).span).toBe('360');
    expect(placed(getByTestId('s2')).row).toBe('361');
    expect(Number(placed(getByTestId('s2')).row) - 1 + Number(placed(getByTestId('s2')).span)).toBe(
      900,
    );
  });

  it('packs a section’s own cards short beside tall', () => {
    const { getByTestId } = render(
      <Board
        heights={[500, 200]}
        cards={[
          [8, 400],
          [4, 100],
          [4, 120],
        ]}
      />,
    );
    expect(getByTestId('inner').hasAttribute('data-masonry')).toBe(true);
    expect(placed(getByTestId('c2'))).toMatchObject({ col: '9' });
    expect(getByTestId('c2').style.getPropertyValue('--masonry-tracks')).toBe('4');
    expect(Number(placed(getByTestId('c2')).row)).toBeGreaterThan(100);
  });

  it('is a no-op below the rung and for a single section', () => {
    wide = false;
    const narrow = render(<Board heights={[900, 200]} cards={[[12, 100]]} />);
    expect(narrow.getByTestId('grid').hasAttribute('data-masonry')).toBe(false);
    expect(narrow.getByTestId('inner').hasAttribute('data-masonry')).toBe(false);
    expect(placed(narrow.getByTestId('s0')).col).toBe('');
    narrow.unmount();

    wide = true;
    const lone = render(<Board heights={[900]} cards={[[12, 100]]} />);
    expect(lone.getByTestId('grid').hasAttribute('data-masonry')).toBe(false);
    expect(lone.getByTestId('inner').hasAttribute('data-masonry')).toBe(false);
  });

  it('hands every grid back and drops every observer and listener on the way out', () => {
    const { getByTestId, unmount } = render(<Board heights={[300, 200]} cards={[[12, 100]]} />);
    const grid = getByTestId('grid');
    const inner = getByTestId('inner');
    const first = getByTestId('s0');
    const card = getByTestId('c0');
    expect(observed).toBeGreaterThan(0);
    expect(listeners).toHaveLength(1);
    unmount();
    expect(observed).toBe(0);
    expect(listeners).toHaveLength(0);
    expect(grid.hasAttribute('data-masonry')).toBe(false);
    expect(inner.hasAttribute('data-masonry')).toBe(false);
    expect(first.getAttribute('style') ?? '').not.toContain('--masonry');
    expect(card.getAttribute('style') ?? '').not.toContain('--masonry');
  });

  it('un-packs when the window narrows below the rung', () => {
    const { getByTestId } = render(<Board heights={[300, 200]} cards={[[12, 100]]} />);
    wide = false;
    listeners.forEach((l) => l());
    expect(getByTestId('grid').hasAttribute('data-masonry')).toBe(false);
    expect(getByTestId('inner').hasAttribute('data-masonry')).toBe(false);
  });

  it('is laid out by Live’s sheet from the rung up, and only there', () => {
    const rail = readFileSync(join(__dirname, '..', 'src/styles/side-rail.css'), 'utf8');
    const wideBlock = /@media \(width >= 2560px\)\s*\{[\s\S]*?\n\}/.exec(rail)?.[0] ?? '';
    // The app's classes lead every selector: `:root[data-template] .card-grid` sets a gap, and at
    // equal weight it outranked the zero row gap and made each 1px row a gap-tall one.
    const lead = String.raw`\.mavea-app\.live-voice\.with-rail \.card-grid\[data-masonry\]`;
    expect(wideBlock).toMatch(
      new RegExp(`${lead}\\s*\\{[^}]*grid-auto-rows:\\s*1px;[^}]*row-gap:\\s*0`),
    );
    expect(wideBlock).toMatch(
      new RegExp(
        `${lead} > \\.depth-section\\s*\\{[^}]*grid-column:\\s*var\\(--masonry-col\\) \\/ span 6;[^}]*grid-row:\\s*var\\(--masonry-row\\) \\/ span var\\(--masonry-span\\)`,
      ),
    );
    expect(wideBlock).toMatch(
      new RegExp(
        `${lead} > \\[class\\*='col-'\\]\\s*\\{[^}]*grid-column:\\s*var\\(--masonry-col\\) \\/ span var\\(--masonry-tracks\\)`,
      ),
    );
    expect(rail.replace(wideBlock, '')).not.toContain('masonry');
  });
});
