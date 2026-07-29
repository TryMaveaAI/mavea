import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditCard, auditCardOverlap, auditCardTruncation } from '../src/gallery/overflowAudit';

// auditCard is the primitive behind the whole layout-overflow guarantee: it decides whether a
// block's content is being silently clipped by its card. It only runs meaningfully in a real
// browser (jsdom has no layout), so the GALLERY tool exercises it live — but its judging logic
// must not silently rot. These tests drive auditCard against a synthetic DOM with mocked rects
// and styles, locking the decisions that matter: real clips are caught, designed scroll/clamp/
// clip-path/paintless/invisible cases are NOT false-flagged.

type Rect = { left: number; right: number; top: number; bottom: number };
const rects = new WeakMap<Element, Rect>();
const styles = new WeakMap<Element, Record<string, string>>();

const DEFAULTS: Record<string, string> = {
  overflowX: 'visible',
  overflowY: 'visible',
  opacity: '1',
  visibility: 'visible',
  fill: 'rgb(0, 0, 0)',
  stroke: 'none',
  strokeWidth: '1',
  clipPath: 'none',
  webkitLineClamp: 'none',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'rect', 'path', 'circle', 'ellipse', 'text', 'tspan']);

function make(
  tag: string,
  opts: { rect?: Rect; style?: Record<string, string>; parent?: Element } = {},
): Element {
  const node = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  if (opts.rect) rects.set(node, opts.rect);
  styles.set(node, opts.style ?? {});
  node.getBoundingClientRect = () => {
    const r = rects.get(node) ?? { left: 0, right: 0, top: 0, bottom: 0 };
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.right - r.left,
      height: r.bottom - r.top,
      x: r.left,
      y: r.top,
      toJSON() {},
    } as DOMRect;
  };
  opts.parent?.appendChild(node);
  return node;
}

beforeEach(() => {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node: Element) => {
    const o = { ...DEFAULTS, ...(styles.get(node) ?? {}) };
    return {
      ...o,
      getPropertyValue: (k: string) =>
        k === '-webkit-line-clamp' ? o.webkitLineClamp : (o[k] ?? ''),
    } as unknown as CSSStyleDeclaration;
  });
});
afterEach(() => vi.restoreAllMocks());

/** A card clipping at overflow:hidden, 100×100 at the origin. */
function clippingCard(overflow = 'hidden'): Element {
  return make('div', {
    rect: { left: 0, right: 100, top: 0, bottom: 100 },
    style: { overflowX: overflow, overflowY: overflow },
  });
}

describe('auditCard', () => {
  it('catches content clipped by overflow:hidden', () => {
    const card = clippingCard();
    make('div', { rect: { left: 0, right: 130, top: 0, bottom: 20 }, parent: card }); // spills 30px right
    const v = auditCard(card);
    expect(v.clip?.px).toBe(30);
    expect(v.scroll).toBeUndefined();
  });

  it('reports a scroll region as the lower-severity scroll kind, not a clip', () => {
    const card = clippingCard('auto');
    make('div', { rect: { left: 0, right: 160, top: 0, bottom: 20 }, parent: card });
    const v = auditCard(card);
    expect(v.scroll?.kind).toBe('scroll');
    expect(v.clip).toBeUndefined();
  });

  it('excuses a deliberately-bounded scroll region (max-height + overflow:auto)', () => {
    // A long table/document body that caps its height and scrolls the rest is meant to scroll,
    // not spill — the overflow is reachable, so it must not be flagged. An unbounded overflow:auto
    // (the test above, no max-height) still reports, so this is specifically the intentional shape.
    const card = make('div', {
      rect: { left: 0, right: 100, top: 0, bottom: 100 },
      style: { overflowX: 'visible', overflowY: 'auto', maxHeight: '460px' },
    });
    make('div', { rect: { left: 0, right: 100, top: 0, bottom: 140 }, parent: card }); // spills 40px down
    const v = auditCard(card);
    expect(v.scroll).toBeUndefined();
    expect(v.clip).toBeUndefined();
  });

  it('passes content that fits within the card', () => {
    const card = clippingCard();
    make('div', { rect: { left: 0, right: 90, top: 0, bottom: 20 }, parent: card });
    expect(auditCard(card)).toEqual({});
  });

  it('does not flag line-clamped prose (the last line is meant to crop)', () => {
    const card = make('div', {
      rect: { left: 0, right: 100, top: 0, bottom: 100 },
      style: { overflowX: 'hidden', overflowY: 'hidden', webkitLineClamp: '2' },
    });
    make('div', { rect: { left: 0, right: 100, top: 0, bottom: 140 }, parent: card }); // spills below
    expect(auditCard(card).clip).toBeUndefined();
  });

  it('does not flag a paintless SVG shape (a hit-target / spacer, nothing to lose)', () => {
    const card = clippingCard();
    make('rect', {
      rect: { left: 0, right: 140, top: 0, bottom: 20 },
      style: { fill: 'none', stroke: 'none' },
      parent: card,
    });
    expect(auditCard(card).clip).toBeUndefined();
  });

  it('does not flag a zero-opacity element (invisible, no content to lose)', () => {
    const card = clippingCard();
    make('div', {
      rect: { left: 0, right: 140, top: 0, bottom: 20 },
      style: { opacity: '0' },
      parent: card,
    });
    expect(auditCard(card).clip).toBeUndefined();
  });

  it('does not flag geometry bounded by a clip-path (the box lies; nothing paints outside)', () => {
    const card = make('div', {
      rect: { left: 0, right: 100, top: 0, bottom: 100 },
      style: { overflowX: 'hidden', overflowY: 'hidden', clipPath: 'inset(0)' },
    });
    make('path', { rect: { left: 0, right: 150, top: 0, bottom: 20 }, parent: card });
    expect(auditCard(card).clip).toBeUndefined();
  });
});

/** A text run: an element carrying visible text, with a mocked box. */
function textRun(
  tag: string,
  text: string,
  rect: Rect,
  parent: Element,
  style: Record<string, string> = {},
): Element {
  const n = make(tag, { rect, style, parent });
  n.textContent = text;
  return n;
}

describe('auditCardOverlap', () => {
  it('flags two text labels whose boxes overlap on both axes', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('text', 'AAAA', { left: 0, right: 60, top: 0, bottom: 20 }, card);
    textRun('text', 'BBBB', { left: 40, right: 100, top: 0, bottom: 20 }, card); // 20px overlap
    expect(auditCardOverlap(card)).toBeTruthy();
  });

  it('does not flag adjacent labels that only touch at an edge', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('text', 'AAAA', { left: 0, right: 40, top: 0, bottom: 20 }, card);
    textRun('text', 'BBBB', { left: 40, right: 80, top: 0, bottom: 20 }, card); // touch at x=40
    expect(auditCardOverlap(card)).toBeUndefined();
  });

  it('does not flag two stacked lines of text (no vertical overlap)', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('text', 'AAAA', { left: 0, right: 60, top: 0, bottom: 20 }, card);
    textRun('text', 'BBBB', { left: 0, right: 60, top: 20, bottom: 40 }, card);
    expect(auditCardOverlap(card)).toBeUndefined();
  });

  it('does not flag a rotated label whose axis-aligned box merely overlaps', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    const a = textRun('text', 'AAAA', { left: 0, right: 60, top: 0, bottom: 20 }, card);
    a.setAttribute('transform', 'rotate(90)');
    textRun('text', 'BBBB', { left: 40, right: 100, top: 0, bottom: 20 }, card);
    expect(auditCardOverlap(card)).toBeUndefined();
  });

  it('does not flag two identical-text layers (a star rating fill over its track)', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('span', '★★★★★', { left: 0, right: 60, top: 0, bottom: 20 }, card);
    textRun('span', '★★★★★', { left: 0, right: 60, top: 0, bottom: 20 }, card); // fill over track
    expect(auditCardOverlap(card)).toBeUndefined();
  });

  it('does not flag a faded-out ghost layer (low opacity) behind a real label', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('text', '木', { left: 0, right: 60, top: 0, bottom: 40 }, card, { opacity: '0.12' });
    textRun('text', '2', { left: 20, right: 40, top: 10, bottom: 30 }, card); // badge over ghost
    expect(auditCardOverlap(card)).toBeUndefined();
  });

  it('exempts pairs inside the SAME tight lockup, but not the lockup against a neighbor', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    const lockup = make('div', { rect: { left: 0, right: 100, top: 0, bottom: 60 }, parent: card });
    lockup.setAttribute('data-tight-lockup', '');
    // A display numeral at sub-1 line-height whose glyph box catches its own caption — by design.
    textRun('span', '2.4M', { left: 0, right: 80, top: 0, bottom: 40 }, lockup);
    textRun('span', 'daily riders', { left: 0, right: 90, top: 30, bottom: 50 }, lockup);
    expect(auditCardOverlap(card)).toBeUndefined();
    // The same lockup colliding with an OUTSIDE label is still a real failure.
    textRun('span', 'neighbor', { left: 60, right: 140, top: 20, bottom: 45 }, card);
    expect(auditCardOverlap(card)).toBeTruthy();
  });

  it('exempts leaflet map markers colliding with each other, but not a caption over the map', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    const pane = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 }, parent: card });
    pane.className = 'leaflet-marker-pane';
    // Two pins at close geographic coordinates — their overlap is data, not layout.
    textRun('span', '1', { left: 40, right: 66, top: 40, bottom: 66 }, pane);
    textRun('span', '3', { left: 55, right: 81, top: 50, bottom: 76 }, pane);
    expect(auditCardOverlap(card)).toBeUndefined();
    // A text label outside the marker pane overlapping a pin is still a real failure.
    textRun('span', 'legend', { left: 50, right: 120, top: 45, bottom: 70 }, card);
    expect(auditCardOverlap(card)).toBeTruthy();
  });

  it('does not flag a low-alpha fill decoration overlapping a label', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('text', 'ghost', { left: 0, right: 60, top: 0, bottom: 20 }, card, {
      fill: 'rgba(0, 0, 0, 0.15)',
    });
    textRun('text', 'REAL', { left: 20, right: 80, top: 0, bottom: 20 }, card);
    expect(auditCardOverlap(card)).toBeUndefined();
  });

  it('still flags two DIFFERENT opaque labels overlapping (a real collision survives)', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 200 } });
    textRun('text', 'Total assets', { left: 0, right: 60, top: 0, bottom: 20 }, card);
    textRun('text', 'opens cash flow', { left: 40, right: 100, top: 0, bottom: 20 }, card);
    expect(auditCardOverlap(card)).toBeTruthy();
  });
});

describe('auditCardTruncation', () => {
  it('flags a dynamic HTML label truncated with an ellipsis', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 60 } });
    textRun('div', 'Brunch + shower…', { left: 0, right: 80, top: 0, bottom: 20 }, card);
    const hits = auditCardTruncation(card);
    expect(hits.some((h) => h.kind === 'ellipsis' && h.text.startsWith('Brunch'))).toBe(true);
  });

  it('flags a truncated SVG text label', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 60 } });
    textRun('text', 'Comedy club or…', { left: 0, right: 80, top: 0, bottom: 20 }, card);
    expect(auditCardTruncation(card).some((h) => h.kind === 'ellipsis')).toBe(true);
  });

  it('excuses a static placeholder / status verb ending in an ellipsis', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 60 } });
    textRun('div', 'Working…', { left: 0, right: 80, top: 0, bottom: 20 }, card);
    expect(auditCardTruncation(card)).toEqual([]);
  });

  it('excuses an ellipsis only when full text has the shared interactive disclosure contract', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 60 } });
    const label = textRun(
      'div',
      'Long plotted lab…',
      { left: 0, right: 80, top: 0, bottom: 20 },
      card,
    );
    label.setAttribute('data-text-disclosure', 'true');
    label.setAttribute('tabindex', '0');
    label.setAttribute('aria-label', 'Long plotted label in full');
    expect(auditCardTruncation(card)).toEqual([]);
  });

  it('excuses a deliberately semantic ellipsis, not arbitrary dynamic truncation', () => {
    const card = make('div', { rect: { left: 0, right: 200, top: 0, bottom: 60 } });
    const notation = textRun(
      'div',
      '1 + x + x² + …',
      { left: 0, right: 120, top: 0, bottom: 20 },
      card,
    );
    notation.setAttribute('data-semantic-ellipsis', 'true');
    expect(auditCardTruncation(card)).toEqual([]);
  });
});
