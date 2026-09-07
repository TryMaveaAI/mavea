import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// The "answers bloom" flag store: localStorage-backed, event-broadcasting, never-throwing, and
// ON by default (the bloom is the experience — a deliberate "calm/off" choice is what persists).
// The module caches its value, so the default/garbage cases reset the module to read from a fresh
// cache; the write cases exercise the live setter.

const KEY = 'mavea-bloom-mode';
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

const fresh = () => import('../src/canvas/reveal/useBloomMode');

describe('useBloomMode store', () => {
  it('defaults to on when nothing is stored', async () => {
    const { getBloomMode } = await fresh();
    expect(getBloomMode()).toBe(true);
  });

  it('reads a persisted off value', async () => {
    localStorage.setItem(KEY, 'off');
    const { getBloomMode } = await fresh();
    expect(getBloomMode()).toBe(false);
  });

  it('degrades a garbage value to the default (on)', async () => {
    localStorage.setItem(KEY, 'sideways');
    const { getBloomMode } = await fresh();
    expect(getBloomMode()).toBe(true);
  });

  it('persists and broadcasts on write', async () => {
    const { getBloomMode, setBloomMode, BLOOM_MODE_EVENT } = await fresh();
    const spy = vi.fn();
    window.addEventListener(BLOOM_MODE_EVENT, spy);
    setBloomMode(false);
    expect(getBloomMode()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('off');
    setBloomMode(true);
    expect(localStorage.getItem(KEY)).toBe('on');
    expect(spy).toHaveBeenCalledTimes(2);
    window.removeEventListener(BLOOM_MODE_EVENT, spy);
  });

  it('never throws when storage is unavailable, and still serves the in-session value', async () => {
    const { getBloomMode, setBloomMode } = await fresh();
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      expect(() => setBloomMode(false)).not.toThrow();
      expect(getBloomMode()).toBe(false); // cache updated even though the write failed
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});

describe('bloom stylesheet wiring', () => {
  it('is registered in the global stylesheet barrel', () => {
    expect(src('../src/styles/styles.css')).toContain("@import './bloom.css'");
  });

  it('gates its motion behind prefers-reduced-motion so a reduced-motion render is static', () => {
    expect(src('../src/styles/bloom.css')).toContain(
      '@media (prefers-reduced-motion: no-preference)',
    );
  });

  it('only applies when the .bloom-on flag is present', () => {
    const css = src('../src/styles/bloom.css');
    expect(css).toContain('.card-grid.bloom-on');
    // No bloom animation may fire on a bare .card-grid — off must equal today's plain reveal.
    expect(css).not.toMatch(/\.card-grid(?!\.bloom-on)[^{]*\{[^}]*animation:\s*mb-/);
  });
});

// The bloom draws content IN from a hidden frame, so while an animation has not started its
// `backwards` fill is what the reader sees. `bloom-on` is a remembered preference and never comes
// off the grid, so any rule gated on it alone holds that hidden frame for the life of the grid —
// and an animation that never starts (a backgrounded tab, a throttled or paused document) hides
// its content permanently. That is how a chart came to paint its axes, gridlines and legend
// around a trend line retracted out of view. Every animating rule must therefore also require the
// TRANSIENT `.blooming` class, which the canvas drops once the choreography's window has passed.
describe('bloom rules never outlive their own animation', () => {
  const css = src('../src/styles/bloom.css').replace(/\/\*[\s\S]*?\*\//g, '');

  /** Each rule as [selector, body]. */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1].trim(), m[2]] as const)
    .filter(([sel]) => sel.includes('.card-grid.bloom-on'));

  it('finds the bloom rules to check', () => {
    expect(rules.length).toBeGreaterThan(5);
  });

  it('gates every rule that animates on the transient .blooming class', () => {
    const ungated = rules
      .filter(([, body]) => /animation:/.test(body))
      .filter(([sel]) => !sel.includes('.blooming'))
      .map(([sel]) => sel);
    expect(ungated, `ungated animating rules: ${ungated.join(' | ')}`).toEqual([]);
  });

  it('leaves the token-only rule ungated, so the timings still resolve', () => {
    const tokens = rules.find(([, body]) => body.includes('--mb-lead'));
    expect(tokens).toBeDefined();
    expect(tokens![0]).not.toContain('.blooming');
  });

  it('drops the class after a bounded window rather than keeping it on', () => {
    const canvas = src('../src/canvas/TopicCanvas.tsx');
    expect(canvas).toMatch(/BLOOM_WINDOW_MS\s*=\s*\d+/);
    expect(canvas).toContain('setBlooming(false)');
    expect(canvas).toContain("' blooming'");
  });
});
