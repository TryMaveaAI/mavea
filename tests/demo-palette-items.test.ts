// The Demo palette used to be a dead-end teaser: every feature it couldn't open in place said
// "Opens in Live" and dropped the user on Live's default screen. buildDemoPaletteItems fixes that —
// a feature that names a walkthrough chapter becomes a real "Watch" mini-demo; only chapterless,
// data-dependent features keep the honest fallback. These pin that three-way split.
import { describe, it, expect, vi } from 'vitest';
import { buildDemoPaletteItems } from '../src/live/features/demoPaletteItems';
import type { Feature } from '../src/live/features/registry';

const feat = (id: string, extra: Partial<Feature> = {}): Feature => ({
  id,
  label: id,
  blurb: id,
  group: 'This session',
  surface: 'both',
  ...extra,
});

describe('buildDemoPaletteItems', () => {
  it('keeps a directly-openable feature direct (available, no Live hand-off)', () => {
    const how = vi.fn();
    const [item] = buildDemoPaletteItems([feat('how')], {
      direct: { how },
      watchInLive: () => vi.fn(),
      enterLive: vi.fn(),
    });
    expect(item.available).toBe(true);
    expect(item.watch).toBeUndefined();
    item.run();
    expect(how).toHaveBeenCalledOnce();
  });

  it('turns a chaptered feature into a live "Watch" — its row IS the demo', () => {
    const play = vi.fn();
    const watchInLive = vi.fn(() => play);
    const [item] = buildDemoPaletteItems([feat('prism', { tourChapter: 'prism' })], {
      direct: {},
      watchInLive,
      enterLive: vi.fn(),
    });
    expect(item.available).toBe(true);
    expect(watchInLive).toHaveBeenCalledWith('prism');
    // Both the row click and the Watch chip play the same mini-demo.
    expect(item.run).toBe(play);
    expect(item.watch).toBe(play);
  });

  it('leaves a chapterless, data-dependent feature as an honest "Opens in Live"', () => {
    const enterLive = vi.fn();
    const [item] = buildDemoPaletteItems([feat('memory')], {
      direct: {},
      watchInLive: () => vi.fn(),
      enterLive,
    });
    expect(item.available).toBe(false);
    expect(item.reason).toBe('Opens in Live');
    expect(item.watch).toBeUndefined();
    item.run();
    expect(enterLive).toHaveBeenCalledOnce();
  });

  it('gives a direct-opening feature with a chapter both actions: open in place, watch the demo', () => {
    const direct = vi.fn();
    const play = vi.fn();
    const watchInLive = vi.fn(() => play);
    const [item] = buildDemoPaletteItems([feat('dashboards', { tourChapter: 'dashboards' })], {
      direct: { dashboards: direct },
      watchInLive,
      enterLive: vi.fn(),
    });
    // The row still opens the real surface — but it no longer sits demo-less next to rows
    // whose only difference is not being directly openable.
    expect(item.run).toBe(direct);
    expect(item.watch).toBe(play);
    expect(watchInLive).toHaveBeenCalledWith('dashboards');
  });
});
