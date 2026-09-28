// The Connect step's API key sat ~770px down a 390x844 phone, and a phone keyboard shrinks only the
// visual viewport — so nothing scrolled the wizard's stage and the field was typed into blind.
// jsdom has no layout, so the geometry is stubbed and the scroll request is what is observed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealAboveKeyboard } from '../src/live/setup/revealAboveKeyboard';

class FakeViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
}

let viewport: FakeViewport;
let field: HTMLLabelElement;
let input: HTMLInputElement;
let scrollIntoView: ReturnType<typeof vi.fn<(options?: ScrollIntoViewOptions) => void>>;

function placeField(top: number): void {
  field.getBoundingClientRect = () => ({ top, bottom: top + 60 }) as DOMRect;
}

beforeEach(() => {
  viewport = new FakeViewport();
  vi.stubGlobal('visualViewport', viewport);
  field = document.createElement('label');
  input = document.createElement('input');
  field.append(input);
  document.body.append(field);
  scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
  field.scrollIntoView = scrollIntoView;
  placeField(771);
});

afterEach(() => {
  field.remove();
  vi.unstubAllGlobals();
});

describe('revealAboveKeyboard', () => {
  it('centres the focused field once the keyboard covers it', () => {
    const cleanup = revealAboveKeyboard(field);
    input.focus();
    // Still in view before the keyboard opens: nothing to do.
    expect(scrollIntoView).not.toHaveBeenCalled();

    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    if (typeof cleanup === 'function') cleanup();
  });

  it('leaves a field that is still visible where it is', () => {
    placeField(200);
    const cleanup = revealAboveKeyboard(field);
    input.focus();
    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    expect(scrollIntoView).not.toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
  });

  it('stops listening on blur and on cleanup', () => {
    const cleanup = revealAboveKeyboard(field);
    input.focus();
    input.blur();
    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    expect(scrollIntoView).not.toHaveBeenCalled();

    input.focus();
    scrollIntoView.mockClear();
    if (typeof cleanup === 'function') cleanup();
    viewport.dispatchEvent(new Event('resize'));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
