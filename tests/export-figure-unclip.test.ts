// Regression: a figure embedded in an export is a static plate — paper and slides have no scrollbar
// to drag. A `terminal` block caps its own listing (`.term-body { max-height: 22rem; overflow: auto }`),
// so an 84-line deploy log PAINTED 17 lines and hid the other 67 behind a scrollbar nobody could
// reach. Worse, the capped box also MEASURES short, so the paginator read the figure as a tidy 385px
// section, never split it across pages, and the lost lines had nowhere to land: the produced PDF was
// simply missing them. `unclipScrollers` lifts the cap so the block renders — and measures — at its
// true height.
import { describe, it, expect } from 'vitest';
import { unclipScrollers } from '../src/canvas/embed/unclip';

/** jsdom computes styles from real CSS, but reports no layout — `scrollHeight`/`clientHeight` are
 *  always 0. Stub them so the "still clipped by an explicit height" branch can be exercised. */
function withLayout(el: HTMLElement, scrollH: number, clientH: number): void {
  Object.defineProperty(el, 'scrollHeight', { value: scrollH, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientH, configurable: true });
}

function mount(html: string, css: string): HTMLElement {
  const style = document.createElement('style');
  style.textContent = css;
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(style, root);
  return root;
}

describe('unclipScrollers', () => {
  // `.term-body` really declares the `overflow: auto` shorthand; jsdom does not expand a shorthand
  // into its longhands for getComputedStyle, so the fixture spells out the longhand a real browser
  // would have computed from it.
  it('lifts the height cap off a block that scrolls its own content away', () => {
    const root = mount(
      `<div class="term"><div class="term-body"><span>line</span></div></div>`,
      `.term-body { max-height: 22rem; overflow-y: auto; }`,
    );
    const body = root.querySelector<HTMLElement>('.term-body')!;
    expect(getComputedStyle(body).overflowY).toBe('auto');

    unclipScrollers(root);

    // No cap ⇒ an `auto` box grows to its content and never scrolls: the rows exist on the page.
    expect(body.style.maxHeight).toBe('none');
    root.remove();
  });

  it('lets content spill when an explicit height still clips it — visible beats swallowed', () => {
    const root = mount(
      `<div class="log"><div class="log-body"><span>row</span></div></div>`,
      `.log-body { height: 100px; overflow-y: scroll; }`,
    );
    const body = root.querySelector<HTMLElement>('.log-body')!;
    withLayout(body, 900, 100); // still clipping after the cap is lifted

    unclipScrollers(root);

    expect(body.style.maxHeight).toBe('none');
    expect(body.style.overflow).toBe('visible');
    root.remove();
  });

  it('leaves an overflow:hidden containment net alone — it is not a scroller', () => {
    const root = mount(
      `<div class="card"><svg class="chart"></svg></div>`,
      `.card { overflow: hidden; max-height: 300px; }`,
    );
    const card = root.querySelector<HTMLElement>('.card')!;

    unclipScrollers(root);

    // Untouched: `overflow: hidden` is the design system's overflow-containment net, not a trapdoor
    // with rows behind it.
    expect(card.style.maxHeight).toBe('');
    expect(card.style.overflow).toBe('');
    root.remove();
  });

  it('is idempotent and safe on a subtree with nothing to unclip', () => {
    const root = mount(`<div class="plain"><p>prose</p></div>`, `.plain { color: red; }`);
    expect(() => {
      unclipScrollers(root);
      unclipScrollers(root);
    }).not.toThrow();
    root.remove();
  });
});
