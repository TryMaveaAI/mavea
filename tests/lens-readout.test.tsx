// The Lens's readout states the scale and is the toggle between the fit and actual size. What
// it offers depends on the scale the fit settled on, which jsdom cannot measure, so the stage's
// FitBox here reports a scale the test chooses.
import { useEffect, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import type { FitFacts } from '../src/canvas/layout/FitBox';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { TopicCanvas } from '../src/canvas/TopicCanvas';

const fit = vi.hoisted(() => ({ k: 0.8 }));
vi.mock('../src/canvas/layout/FitBox', () => ({
  FitBox({
    children,
    onScale,
  }: {
    children: ReactNode;
    onScale?: (k: number, facts: FitFacts) => void;
  }) {
    useEffect(() => onScale?.(fit.k, { legibleMin: 0.4, spills: false }), [onScale]);
    return (
      <div className="fit-box">
        <div>{children}</div>
      </div>
    );
  },
}));

const insight = (id: string, title: string) =>
  ({ type: 'insight', id, num: '1', col: 6, props: { title, body: 'Body.' } }) as unknown as Block;
const spec = {
  id: 't',
  workspace: 'T',
  title: 'T',
  sub: '',
  opener: '',
  context: [],
  blocks: [insight('a', 'Alpha'), insight('b', 'Beta')],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [],
  keywords: [],
} as unknown as ConversationSpec;

const mount = () =>
  render(
    <TopicCanvas
      data={spec}
      spot={null}
      built={{}}
      onProve={() => {}}
      viewMode="board"
      onViewMode={() => {}}
      onLens={() => {}}
    />,
  );
const cell0 = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-spot-id="${id}"]`) as HTMLElement;
function cleanClick(el: HTMLElement) {
  fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.click(el, { button: 0, clientX: 10, clientY: 10 });
}

describe('fit and actual size', () => {
  const readout = () => screen.getByRole('button', { name: /^Zoom \d+%\./ }) as HTMLButtonElement;
  const now = (root: HTMLElement) => root.querySelector('.zoom-sheet-zoom-now')?.textContent;
  const bodyZoom = (root: HTMLElement) =>
    (root.querySelector('.zoom-sheet-body') as HTMLElement).style.zoom;
  beforeEach(() => {
    fit.k = 0.8;
  });

  it('opens fitted, and the readout toggles between the fit and actual size', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    // Fitted: the body carries no magnification of its own, and the readout offers 100%.
    expect(bodyZoom(container)).toBe('');
    expect(readout().getAttribute('aria-label')).toMatch(/Actual size$/);
    expect(readout().getAttribute('aria-keyshortcuts')).toBe('Shift+0');
    expect(readout().title).toBe('Actual size (Shift+0)');
    fireEvent.click(readout());
    expect(bodyZoom(container)).toBe('1');
    expect(now(container)).toBe('100%');
    expect(readout().getAttribute('aria-label')).toMatch(/Fit to the stage$/);
    expect(readout().getAttribute('aria-keyshortcuts')).toBe('Shift+1');
    // Any manual zoom offers the fit too.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(now(container)).toBe('115%');
    expect(readout().getAttribute('aria-label')).toMatch(/Fit to the stage/);
    fireEvent.click(readout());
    expect(bodyZoom(container)).toBe('');
  });

  it('holds one value as its text, whatever it offers', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    // Fitted at 80%, offering actual size: the offer rides an attribute, not a second text run
    // (which read as "80%100%" to anything that takes the button's text).
    expect(readout().textContent).toBe('80%');
    expect(readout().dataset.offer).toBe('100%');
    fireEvent.click(readout());
    expect(readout().textContent).toBe('100%');
    expect(readout().dataset.offer).toBe('Fit');
  });

  it('takes Shift+0 as actual size and Shift+1 as the fit, by the physical key', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // US layout: Shift+0 types ")".
    expect(fireEvent.keyDown(window, { key: ')', code: 'Digit0', shiftKey: true })).toBe(false);
    expect(bodyZoom(container)).toBe('1');
    fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true });
    expect(bodyZoom(container)).toBe('');
    // AZERTY: the same keys type the digits themselves.
    fireEvent.keyDown(window, { key: '0', code: 'Digit0', shiftKey: true });
    expect(bodyZoom(container)).toBe('1');
    fireEvent.keyDown(window, { key: '1', code: 'Digit1', shiftKey: true });
    expect(bodyZoom(container)).toBe('');
  });

  it('offers nothing when the fit is already actual size, from the readout or the keyboard', () => {
    fit.k = 1;
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    expect(now(container)).toBe('100%');
    expect(readout().getAttribute('aria-disabled')).toBe('true');
    expect(readout().getAttribute('aria-label')).toBe('Zoom 100%. Already actual size');
    expect(readout().hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(readout().hasAttribute('data-offer')).toBe(false);
    fireEvent.click(readout());
    fireEvent.keyDown(window, { key: ')', code: 'Digit0', shiftKey: true });
    // Still the fit: the notes keep the layout the fit gave them.
    expect(bodyZoom(container)).toBe('');
    expect(container.querySelector('[data-magnified]')).toBeNull();
    // A step in still leaves the fit, and the readout offers the way back.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(readout().getAttribute('aria-disabled')).toBeNull();
    expect(readout().getAttribute('aria-label')).toMatch(/Fit to the stage$/);
  });

  it('lands on 100% when a step would jump over it, from a fit that is not a round number', () => {
    fit.k = 1.05;
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    expect(now(container)).toBe('105%');
    // 105 → 90 would never show 100: the step stops there instead.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(now(container)).toBe('100%');
    expect(bodyZoom(container)).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(now(container)).toBe('85%');
    // …and the same on the way back up, from below.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(now(container)).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(now(container)).toBe('115%');
  });

  it('lands on 100% stepping in from a fit just under it', () => {
    fit.k = 0.95;
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(now(container)).toBe('100%');
  });

  it('keeps the magnification the reader set while they step between cards', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    fireEvent.click(readout());
    expect(now(container)).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeTruthy();
    expect(now(container)).toBe('100%');
    expect(bodyZoom(container)).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(now(container)).toBe('115%');
  });

  it('keeps fitting each card while the reader has not chosen a number, and fits again on a new open', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(bodyZoom(container)).toBe('');
    expect(now(container)).toBe('80%');
    // A chosen number is for this visit: reopening a card from the board starts fitted again.
    fireEvent.click(readout());
    fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }));
    cleanClick(cell0(container, 'b'));
    expect(bodyZoom(container)).toBe('');
    expect(now(container)).toBe('80%');
  });

  it('names its press on hover only where a pointer can hover, and on keyboard focus always', () => {
    const css = readFileSync('src/styles/wow-polish.css', 'utf8');
    // Everything outside `@media (hover: hover)` blocks, cut by brace depth.
    let rest = '';
    for (let i = 0; i < css.length;) {
      const at = css.indexOf('@media (hover: hover)', i);
      if (at < 0) {
        rest += css.slice(i);
        break;
      }
      rest += css.slice(i, at);
      let depth = 0;
      let j = css.indexOf('{', at);
      for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) break;
      }
      i = j + 1;
    }
    expect(rest).not.toMatch(/\.zoom-sheet-zoom-level[^{]*:hover/);
    expect(css).toMatch(/\.zoom-sheet-zoom-level:focus-visible::after/);
  });
});
