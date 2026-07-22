// Hold a configurable key anywhere to talk — the keyboard twin of the composer's press-and-hold
// mic. Default is Alt (⌥ on Mac). A short hold threshold filters out incidental taps.
// Release — or losing window focus — always ends the capture, so the mic can never stick open.
//
// It only arms on a BARE press of the chosen key: no other modifier may be held, and the moment any
// OTHER key joins the hold we abort, because that press was the start of a real combination (⌥E for
// é, ⌃A, …) rather than someone reaching for the mic. That abort is what keeps the key safe to
// listen for everywhere — including inside a text field, which is where this has to work: the Live
// composer takes focus whenever you aren't already speaking, so refusing to arm over a focused
// input (the rule this used to apply) meant push-to-talk did nothing at all in the one place people
// actually press it. A bare modifier types no character, so holding it over an input is unambiguous.
//
// The side option pins it to the left or right physical key via KeyboardEvent.code, so e.g. only
// Right Ctrl talks while Left Ctrl stays free for everything else.
import { useEffect, useRef } from 'react';
import type { PttSide } from '../useLiveConfig';

const HOLD_MS = 350; // same press-and-hold threshold as the composer mic

/** Each chosen key is itself a modifier; this maps it to the event flag it sets when pressed,
 *  so we can demand that flag is the ONLY modifier active (a bare press, not a combination). */
const SELF_MODIFIER: Record<string, 'altKey' | 'ctrlKey' | 'shiftKey'> = {
  Alt: 'altKey',
  Control: 'ctrlKey',
  Shift: 'shiftKey',
};
const ALL_MODIFIERS = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const;

/** True when this keydown is a bare press of the configured key on the configured side. */
function matchesPtt(e: KeyboardEvent, key: string, side: PttSide): boolean {
  if (e.key !== key) return false;
  if (side !== 'any' && e.code !== key + (side === 'left' ? 'Left' : 'Right')) return false;
  // No OTHER modifier may be held — the key's own flag is allowed (it's the key being pressed).
  const self = SELF_MODIFIER[key];
  return !ALL_MODIFIERS.some((m) => m !== self && e[m]);
}

export function useHoldToTalk(opts: {
  enabled: boolean;
  /** KeyboardEvent.key value to listen for. Defaults to 'Alt'. */
  pttKey?: string;
  /** Which physical side of the key counts: 'any' (default), 'left', or 'right'. */
  pttSide?: PttSide;
  onStart: () => void;
  onStop: () => void;
}): void {
  // Callbacks live in a ref so the listeners bind once per `enabled`/`pttKey` flip.
  const cb = useRef(opts);
  cb.current = opts;
  useEffect(() => {
    if (!opts.enabled) return;
    const key = opts.pttKey || 'Alt';
    const side: PttSide = opts.pttSide || 'any';
    let timer: number | null = null;
    let held = false;
    const clear = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const release = (): void => {
      clear();
      if (held) {
        held = false;
        cb.current.onStop();
      }
    };
    const onDown = (e: KeyboardEvent): void => {
      if (!matchesPtt(e, key, side)) {
        // Another key arrived while we were holding (or waiting on) the mic key: this is a real
        // combination, not a reach for the mic. Stand down — and stop the capture if it had already
        // opened, so a slow ⌥E can't leave the mic listening.
        if (e.key !== key) release();
        return;
      }
      if (e.repeat || timer !== null || held) return;
      timer = window.setTimeout(() => {
        timer = null;
        held = true;
        cb.current.onStart();
      }, HOLD_MS);
    };
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === key) release();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
      release();
    };
  }, [opts.enabled, opts.pttKey, opts.pttSide]);
}

/** Returns the display label for a KeyboardEvent.key value, platform-aware. With a side, prefixes
 *  it (e.g. "Right ⌃") so the hint reads as the exact physical key the user chose. */
export function pttKeyLabel(key: string, side: PttSide = 'any'): string {
  const mac =
    typeof navigator !== 'undefined' &&
    /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
  const base =
    key === 'Alt'
      ? mac
        ? '⌥'
        : 'Alt'
      : key === 'Control'
        ? mac
          ? '⌃'
          : 'Ctrl'
        : key === 'Shift'
          ? mac
            ? '⇧'
            : 'Shift'
          : key;
  if (side === 'left') return `Left ${base}`;
  if (side === 'right') return `Right ${base}`;
  return base;
}
