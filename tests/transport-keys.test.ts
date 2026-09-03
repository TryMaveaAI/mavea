import { describe, expect, it } from 'vitest';
import { transportKeyBelongsToControl } from '../src/tour/driverKit';

// The walkthrough and the demo replay listen for ←/→/Space on the WINDOW while the real Live
// surface stays interactive underneath. This is the rule that decides who owns the key — and
// getting it wrong steals arrows from the card rail and the voice scrubber mid-replay.

function keyOn(el: Element | null, key: string, defaultPrevented = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, cancelable: true });
  if (defaultPrevented) e.preventDefault();
  Object.defineProperty(e, 'target', { value: el, configurable: true });
  return e;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('transportKeyBelongsToControl', () => {
  it('leaves the arrows to the transport when nothing focusable owns them', () => {
    const plain = mount('<div><span id="t">text</span></div>');
    const target = plain.querySelector('#t');
    expect(transportKeyBelongsToControl(keyOn(target, 'ArrowRight'))).toBe(false);
    expect(transportKeyBelongsToControl(keyOn(target, 'ArrowLeft'))).toBe(false);
  });

  it('yields the arrows to a slider — the voice scrubber seeks instead of stepping the replay', () => {
    const strip = mount('<div role="slider" tabindex="0"></div>');
    expect(transportKeyBelongsToControl(keyOn(strip, 'ArrowLeft'))).toBe(true);
    expect(transportKeyBelongsToControl(keyOn(strip, 'ArrowRight'))).toBe(true);
  });

  it('yields the arrows to a composite widget that owns them for its focused child', () => {
    // The Focus filmstrip: entries are role="button" inside a role="toolbar" that runs the
    // arrow navigation for whichever entry has focus.
    const rail = mount('<div role="toolbar"><div role="button" id="e" tabindex="0"></div></div>');
    expect(transportKeyBelongsToControl(keyOn(rail.querySelector('#e'), 'ArrowRight'))).toBe(true);
  });

  it('yields any arrow the focused control already acted on', () => {
    const btn = mount('<button type="button"></button>');
    expect(transportKeyBelongsToControl(keyOn(btn, 'ArrowRight', true))).toBe(true);
    expect(transportKeyBelongsToControl(keyOn(btn, 'ArrowRight'))).toBe(false);
  });

  it('still lets a focused button keep Space, and a text field keep everything', () => {
    const btn = mount('<button type="button"></button>');
    expect(transportKeyBelongsToControl(keyOn(btn, ' '))).toBe(true);
    const input = mount('<input />');
    expect(transportKeyBelongsToControl(keyOn(input, 'ArrowRight'))).toBe(true);
    expect(transportKeyBelongsToControl(keyOn(input, ' '))).toBe(true);
  });

  it('never claims Escape — leaving the run is always global', () => {
    const strip = mount('<div role="slider" tabindex="0"></div>');
    expect(transportKeyBelongsToControl(keyOn(strip, 'Escape'))).toBe(false);
  });
});
