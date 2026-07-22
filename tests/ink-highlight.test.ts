// The Mark highlighter's resolution engine. The real browser caret/element hit-testing lives behind
// an injected HitTester, so here we drive the pure logic with a deterministic fake that maps an x
// coordinate to a text node + offset (a virtual line of glyphs). The headline case is the one the
// old bbox resolver got wrong: a stroke over a value next to a label must grab the VALUE, by the
// exact characters the pen crossed — never the neighbour. jsdom has no layout, so highlight rects
// come back empty; resolution doesn't depend on them.
import { afterEach, describe, expect, it } from 'vitest';
import { highlightUnderStroke, clampText } from '../src/live/annotate/highlight';
import { densify, type Pt } from '../src/live/annotate/geometry';
import { resolveHighlight } from '../src/live/annotate/resolve';
import {
  resolveInkTargets,
  dedupeById,
  inkLabel,
  inkPromptText,
  type InkIntent,
} from '../src/live/annotate/inkIntent';
import type { CaretHit, HitTester } from '../src/live/annotate/hitTest';
import type { Block } from '../src/data/conversation';

// ---- a fake hit tester: each text node owns an x-range; offset is linear across it -------------

interface Glyphs {
  node: Text;
  x0: number;
  x1: number;
}
function hitter(entries: Glyphs[], els: Element[] = []): HitTester {
  return {
    caretAt(x: number): CaretHit | null {
      for (const e of entries) {
        if (x >= e.x0 && x < e.x1) {
          const frac = (x - e.x0) / (e.x1 - e.x0);
          return {
            node: e.node,
            offset: Math.max(0, Math.min(e.node.length, Math.round(frac * e.node.length))),
          };
        }
      }
      return null;
    },
    elementsAt: () => els,
  };
}

const SVG = { left: 0, top: 0 } as DOMRect;
const hLine = (x0: number, x1: number, y = 10): Pt[] => [
  { x: x0, y },
  { x: x1, y },
];

let mounted: Element[] = [];
function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  mounted.push(host);
  return host;
}
afterEach(() => {
  mounted.forEach((m) => m.remove());
  mounted = [];
});

describe('highlightUnderStroke — caret-precise grab', () => {
  it('grabs the value the stroke crossed, NOT the adjacent label (the headline regression)', () => {
    const host = mount(
      '<div data-spot-id="a" data-kind="bars"><span>Seattle</span><span>$1,950</span></div>',
    );
    const [label, value] = host.querySelectorAll('span');
    const hit = hitter([
      { node: label.firstChild as Text, x0: 0, x1: 90 },
      { node: value.firstChild as Text, x0: 100, x1: 200 },
    ]);
    const res = highlightUnderStroke(hLine(102, 198), SVG, hit);
    expect(res).not.toBeNull();
    expect(res!.text).toBe('$1,950');
    expect(res!.blockId).toBe('a');
  });

  it('joins a multi-node stroke in DOM order, owned by the most-sampled node', () => {
    const host = mount('<div data-spot-id="a"><span>Seattle</span><span>$1,950</span></div>');
    const [label, value] = host.querySelectorAll('span');
    const hit = hitter([
      { node: label.firstChild as Text, x0: 0, x1: 90 },
      { node: value.firstChild as Text, x0: 100, x1: 200 },
    ]);
    const res = highlightUnderStroke(hLine(2, 198), SVG, hit);
    expect(res!.text).toBe('Seattle $1,950');
    expect(res!.blockId).toBe('a');
  });

  it('a single glancing caret grabs the whole word around it (a dot on a word names the word)', () => {
    const host = mount('<div data-spot-id="z"><p>hello world</p></div>');
    const node = host.querySelector('p')!.firstChild as Text;
    const hit = hitter([{ node, x0: 0, x1: 110 }]);
    const res = highlightUnderStroke(hLine(30, 30), SVG, hit); // a tap-like stroke at one x
    expect(res!.text).toBe('hello');
  });

  it('grounds text with no data-spot-id ancestor as a valid, block-less grab', () => {
    const host = mount('<section><p>plain prose here</p></section>');
    const node = host.querySelector('p')!.firstChild as Text;
    const hit = hitter([{ node, x0: 0, x1: 160 }]);
    const res = highlightUnderStroke(hLine(2, 158), SVG, hit);
    expect(res!.text).toBe('plain prose here');
    expect(res!.blockId).toBe('');
  });

  it('falls back to a labelled element (SVG chart text) when no caret resolves', () => {
    const host = mount('<div data-spot-id="c"></div>');
    const svgText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    svgText.textContent = 'Activation';
    host.firstElementChild!.appendChild(svgText);
    const hit = hitter([], [svgText]); // caretAt always null → element fallback
    const res = highlightUnderStroke(hLine(10, 60), SVG, hit);
    expect(res!.text).toBe('Activation');
    expect(res!.blockId).toBe('c');
  });

  it('skips chrome text (the card eyebrow) and grabs the real datum', () => {
    const host = mount(
      '<div data-spot-id="a"><div class="card-eyebrow">Rent by city</div><span>$1,950</span></div>',
    );
    const eyebrow = host.querySelector('.card-eyebrow')!.firstChild as Text;
    const value = host.querySelector('span')!.firstChild as Text;
    const hit = hitter([
      { node: eyebrow, x0: 0, x1: 90 },
      { node: value, x0: 100, x1: 200 },
    ]);
    const res = highlightUnderStroke(hLine(2, 198), SVG, hit);
    expect(res!.text).toBe('$1,950'); // the eyebrow is chrome, never named
  });

  it('returns null over open space (no text, no labelled element)', () => {
    mount('<div data-spot-id="a"><span>x</span></div>');
    const hit = hitter([], []); // nothing under the stroke
    expect(highlightUnderStroke(hLine(2, 200), SVG, hit)).toBeNull();
  });
});

describe('resolveHighlight — InkIntent packaging', () => {
  it('wraps the grab as a highlight intent with the owning block id', () => {
    const host = mount('<div data-spot-id="a"><span>$1,950</span></div>');
    const value = host.querySelector('span')!.firstChild as Text;
    const hit = hitter([{ node: value, x0: 0, x1: 100 }]);
    const out = resolveHighlight(hLine(2, 98), { stage: host, svgRect: SVG }, hit);
    expect(out).not.toBeNull();
    expect(out!.intent).toEqual({ kind: 'highlight', blockIds: ['a'], textAt: '$1,950' });
  });

  it('returns null when nothing resolves (so the hook can nudge a miss)', () => {
    const host = mount('<div data-spot-id="a"></div>');
    expect(
      resolveHighlight(hLine(2, 98), { stage: host, svgRect: SVG }, hitter([], [])),
    ).toBeNull();
  });
});

describe('densify', () => {
  it('interpolates so samples sit no more than the step apart', () => {
    const out = densify(hLine(0, 100), 4);
    expect(out.length).toBeGreaterThan(20);
    for (let i = 1; i < out.length; i++)
      expect(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y)).toBeLessThanOrEqual(
        4.001,
      );
  });

  it('caps total samples on a pathologically long stroke', () => {
    const out = densify(hLine(0, 10_000_000), 4);
    expect(out.length).toBeLessThanOrEqual(2002);
  });
});

describe('clampText', () => {
  it('collapses whitespace and truncates very long runs', () => {
    expect(clampText('  a\n  b  ')).toBe('a b');
    expect(clampText('x'.repeat(200)).length).toBe(80);
  });
});

// ---- contract: resolveInkTargets / dedupeById / label + prompt copy ---------------------------

const blk = (id: string | undefined): Block =>
  ({ type: 'insight', id, num: '1', col: 12, props: { title: id ?? '' } }) as unknown as Block;
const mark = (textAt: string, ids: string[] = []): InkIntent => ({
  kind: 'highlight',
  blockIds: ids,
  textAt,
});

describe('resolveInkTargets', () => {
  const spec = [blk('a'), blk('b'), blk('c')];

  it('resolves block-bearing marks to real blocks, deduped in DOM order', () => {
    const { intents, blocks } = resolveInkTargets([mark('x', ['a']), mark('y', ['c'])], spec);
    expect(intents).toHaveLength(2);
    expect(blocks.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('keeps a text-only mark (no block ids) — its literal text grounds the turn alone', () => {
    const { intents, blocks } = resolveInkTargets([mark('plain text')], spec);
    expect(intents).toHaveLength(1);
    expect(blocks).toHaveLength(0);
  });

  it('drops a mark whose block went stale', () => {
    const { intents } = resolveInkTargets([mark('x', ['gone'])], spec);
    expect(intents).toHaveLength(0);
  });
});

describe('dedupeById', () => {
  it('keeps first occurrence and drops id-less blocks', () => {
    expect(dedupeById([blk('a'), blk('a'), blk(undefined), blk('b')]).map((b) => b.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('ink label + prompt copy', () => {
  it('labels a mark by its grabbed text', () => {
    expect(inkLabel(mark('$1,950'))).toBe('Marked “$1,950”');
  });

  it('builds a neutral "Tell me about" prompt, with a count for multiple marks', () => {
    expect(inkPromptText([mark('Ionization')])).toBe('Tell me about “Ionization”');
    expect(inkPromptText([mark('Ionization'), mark('Drift')])).toBe(
      'Tell me about “Ionization” (and 1 more)',
    );
    expect(inkPromptText([])).toBe('');
  });
});
