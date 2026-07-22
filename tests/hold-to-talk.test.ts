// Hold-to-talk must arm ONLY on a bare press of the chosen key (no other modifier, not in a text
// field) and, when a side is chosen, only on that physical key. This guards the two bugs: the mic
// opening inside real shortcuts (⌘/⌃ combinations), and "Right Ctrl" being indistinguishable from
// "Left Ctrl" because they share KeyboardEvent.key.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHoldToTalk, pttKeyLabel } from '../src/live/voice/useHoldToTalk';
import type { PttSide } from '../src/live/useLiveConfig';

const HOLD_MS = 350;

function press(init: KeyboardEventInit, target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    vi.advanceTimersByTime(HOLD_MS + 10);
  });
}

function mount(pttKey: string, pttSide: PttSide = 'any') {
  const onStart = vi.fn();
  const onStop = vi.fn();
  renderHook(() => useHoldToTalk({ enabled: true, pttKey, pttSide, onStart, onStop }));
  return { onStart, onStop };
}

describe('useHoldToTalk — bare-press + side matching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('arms on a bare press of the chosen key', () => {
    const { onStart } = mount('Control');
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does NOT arm when another modifier is held (a real shortcut)', () => {
    const { onStart } = mount('Control');
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true, metaKey: true });
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true, shiftKey: true });
    expect(onStart).not.toHaveBeenCalled();
  });

  // The Live composer takes focus whenever you aren't already speaking, so the keydown target is
  // almost always an <input>. Refusing to arm there — the old rule — meant push-to-talk did nothing
  // at all in the one place people actually press it. A bare modifier types no character, so the
  // hold is unambiguous even over a focused field.
  it('arms over a focused text field — that is where the composer lives', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { onStart } = mount('Control');
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true }, input);
    expect(onStart).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('a real combination cancels instead of opening the mic (⌥ then E, for é)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { onStart, onStop } = mount('Alt');
    // The modifier goes down, but the letter lands before the hold threshold — never a mic press.
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Alt', code: 'AltLeft', altKey: true }),
      );
      vi.advanceTimersByTime(100);
      input.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'e', code: 'KeyE', altKey: true }),
      );
      vi.advanceTimersByTime(HOLD_MS + 10);
    });
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    input.remove();
  });

  it('a letter arriving after the mic opened closes it again', () => {
    const { onStart, onStop } = mount('Alt');
    press({ key: 'Alt', code: 'AltLeft', altKey: true });
    expect(onStart).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'e', code: 'KeyE', altKey: true }),
      );
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('with side="right", only the right physical key arms', () => {
    const { onStart } = mount('Control', 'right');
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
    expect(onStart).not.toHaveBeenCalled();
    press({ key: 'Control', code: 'ControlRight', ctrlKey: true });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('side="any" accepts either physical key', () => {
    const { onStart } = mount('Alt', 'any');
    press({ key: 'Alt', code: 'AltRight', altKey: true });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('releasing the key stops the capture', () => {
    const { onStart, onStop } = mount('Control');
    press({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
    expect(onStart).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft' }));
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('pttKeyLabel', () => {
  it('labels the bare key and prefixes a chosen side', () => {
    // On non-mac the base label is the word; mac shows the glyph. Assert side-prefix behavior
    // independent of platform by checking the suffix.
    expect(pttKeyLabel('Control', 'left').startsWith('Left ')).toBe(true);
    expect(pttKeyLabel('Control', 'right').startsWith('Right ')).toBe(true);
    expect(pttKeyLabel('Control', 'any')).not.toMatch(/^(Left|Right) /);
  });
});
