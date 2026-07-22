import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardCapable } from '../src/canvas/focus/canvasGate';
import type { Block, ConversationSpec } from '../src/data/conversation';

// The Canvas view's structural offer gate + the 'canvas' ViewMode round-trip. boardCapable is the
// single hard gate for both the header toggle and the Live chip, so a genuinely board-shaped answer
// (enough cards, enough variety, at least one spatial block) opens it and a thin one never does.

const block = (id: string | undefined, type: string): Block =>
  ({ ...(id ? { id } : {}), type, props: {} }) as unknown as Block;
const spec = (...blocks: Block[]): ConversationSpec =>
  ({ title: 'x', blocks }) as unknown as ConversationSpec;

describe('boardCapable', () => {
  it('accepts a board-shaped answer (enough cards + variety + a spatial block)', () => {
    expect(
      boardCapable(
        spec(
          block('a', 'geomap'),
          block('b', 'timeline'),
          block('c', 'insight'),
          block('d', 'breakdown'),
        ),
      ),
    ).toBe(true);
  });

  it('rejects too few cards', () => {
    expect(
      boardCapable(spec(block('a', 'geomap'), block('b', 'timeline'), block('c', 'insight'))),
    ).toBe(false);
  });

  it('rejects too little variety (one type repeated)', () => {
    expect(
      boardCapable(
        spec(
          block('a', 'geomap'),
          block('b', 'geomap'),
          block('c', 'geomap'),
          block('d', 'geomap'),
        ),
      ),
    ).toBe(false);
  });

  it('accepts any subject, not just maps/timelines (a varied comparison/breakdown qualifies)', () => {
    expect(
      boardCapable(
        spec(block('a', 'insight'), block('b', 'list'), block('c', 'quotes'), block('d', 'chart')),
      ),
    ).toBe(true);
  });

  it('counts only id-bearing cards as nodes', () => {
    // three id-cards + one id-less block → below the four-card floor.
    expect(
      boardCapable(
        spec(
          block('a', 'geomap'),
          block('b', 'timeline'),
          block('c', 'insight'),
          block(undefined, 'breakdown'),
        ),
      ),
    ).toBe(false);
  });

  it('degrades safely on null / undefined / empty', () => {
    expect(boardCapable(null)).toBe(false);
    expect(boardCapable(undefined)).toBe(false);
    expect(boardCapable(spec())).toBe(false);
  });
});

describe("ViewMode 'canvas' is a transient, opt-in view (never sticky)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('accepts canvas in-session but NEVER persists it (so it cannot stick across answers/reloads)', async () => {
    const m = await import('../src/canvas/focus/useFocusMode');
    m.setViewMode('canvas');
    expect(m.getViewMode()).toBe('canvas'); // active this session
    expect(localStorage.getItem('mavea-view-mode')).not.toBe('canvas'); // but never saved
  });

  it('opening canvas does not clobber the saved focus/everything preference', async () => {
    const m = await import('../src/canvas/focus/useFocusMode');
    m.setViewMode('focus');
    m.setViewMode('canvas');
    expect(m.getViewMode()).toBe('canvas');
    expect(localStorage.getItem('mavea-view-mode')).toBe('focus'); // preference preserved
  });
});
