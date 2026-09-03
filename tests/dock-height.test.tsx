// The dock writes its own rendered height into --dock-h and everything that must sit clear of it
// (scrubber, canvas padding, the listen/speak overlays) reserves that many pixels. If the dock ALSO
// sizes itself from that variable the two form a loop that can only ratchet upward: a notice
// mounts, the dock grows, its floor grows with it, and dismissing the notice gives nothing back —
// dead space under the composer for the rest of the session.
//
// jsdom has no layout engine and vitest runs with `css: false`, so the loop is reproduced rather
// than rendered: the dock's height is resolved the way a browser resolves it, max(content,
// min-height), with the min-height expression read out of voice.css itself so this tracks the real
// rule instead of a copy. Both halves are asserted — the resolved height is what a reader sees,
// --dock-h is what the neighbours reserve.
import { act, render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockBar } from '../src/live/voice/DockBar';

const css = readFileSync(join(__dirname, '..', 'src/live/voice/voice.css'), 'utf8');

/** The custom property `.live-voice .live-dock`'s min-height resolves against. */
const FLOOR_VAR = (() => {
  const rule = /\.live-voice \.live-dock\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  return /min-height:\s*var\((--[\w-]+)\)/.exec(rule)?.[1] ?? '';
})();

/** The pixel value that property is declared with on the app root. */
const FLOOR = Number(new RegExp(`\\${FLOOR_VAR}:\\s*([\\d.]+)px`).exec(css)?.[1] ?? NaN);

const CAPSULE_H = 110; // the composer alone, measured
const NOTICE_H = 72; // the dismissible "Speech can become provider data" strip above it

let observers: (() => void)[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly cb: () => void) {}
      observe(): void {
        observers.push(this.cb);
      }
      unobserve(): void {}
      disconnect(): void {
        observers = observers.filter((c) => c !== this.cb);
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

/** Mount the dock under an app root that resolves its height the way a browser would. */
function mountDock(): {
  reserved: () => string;
  height: () => number;
  setContent: (h: number) => void;
} {
  const app = document.createElement('div');
  app.className = 'mavea-app live-voice';
  document.body.append(app);

  let content = CAPSULE_H;
  // The floor is re-read from the app root's CURRENT custom properties on every measure — that
  // lookup IS the coupling under test, so it goes through the cascade rather than a constant.
  const floor = (): number => {
    const set = app.style.getPropertyValue(FLOOR_VAR);
    return set ? parseFloat(set) : FLOOR;
  };
  const height = (): number => Math.max(content, floor());

  render(
    <DockBar holdEnabled={false} onHoldStart={() => {}} onHoldEnd={() => {}}>
      <div />
    </DockBar>,
    { container: app },
  );
  const dock = app.querySelector<HTMLElement>('.live-dock')!;
  Object.defineProperty(dock, 'offsetHeight', { get: height });

  const settle = (): void => act(() => observers.forEach((cb) => cb()));
  settle(); // the observer's first delivery, once the bar has a box

  return {
    reserved: () => app.style.getPropertyValue('--dock-h'),
    height,
    setContent: (h) => {
      content = h;
      settle();
    },
  };
}

describe('the bottom dock gives back the pixels a dismissed notice released', () => {
  it('takes its floor from a token, not from the height it publishes', () => {
    expect(FLOOR_VAR, 'the dock declares no min-height variable').toBeTruthy();
    expect(FLOOR_VAR).not.toBe('--dock-h');
    expect(FLOOR).toBeGreaterThan(0);
  });

  it('is exactly as tall after a notice mounts and unmounts as it was before', () => {
    const dock = mountDock();
    const before = { height: dock.height(), reserved: dock.reserved() };

    dock.setContent(CAPSULE_H + NOTICE_H);
    expect(dock.height()).toBe(before.height + NOTICE_H);
    expect(dock.reserved()).toBe(`${before.height + NOTICE_H}px`);

    dock.setContent(CAPSULE_H);
    expect(dock.height()).toBe(before.height);
    expect(dock.reserved()).toBe(before.reserved);
  });

  it('still holds its floor when the composer alone is shorter than the bar', () => {
    const dock = mountDock();
    dock.setContent(FLOOR - 20);
    expect(dock.height()).toBe(FLOOR);

    dock.setContent(FLOOR + 40);
    dock.setContent(FLOOR - 20);
    expect(dock.height()).toBe(FLOOR);
  });
});
