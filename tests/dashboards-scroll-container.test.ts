// The dashboards surface is its own scroll container: .mavea-app is an overflow-clipped fixed
// frame (live-transcript.css), so if this surface doesn't scroll itself, everything below the
// fold is simply unreachable — no scrollbar, no wheel, nothing. The compound selector is the
// load-bearing part: a bare `.dash-app` TIES `.mavea-app { overflow: clip }` on specificity and
// wins or loses on stylesheet order, which the bundler does not promise — an import reshuffle is
// exactly how the detail page shipped unscrollable, with jsdom none the wiser. Cascade can't be
// asserted here, so pin the source.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../src/live/dashboards/dashboards.css'), 'utf8');

describe('dashboards scroll container', () => {
  it('declares the scroller on the compound selector, so specificity beats stylesheet order', () => {
    const rule = css.match(/\.mavea-app\.dash-app\s*\{[^}]*\}/);
    expect(rule, '.mavea-app.dash-app rule missing').toBeTruthy();
    expect(rule![0]).toContain('overflow-y: auto');
  });

  it('never re-introduces a bare .dash-app scroll rule that order could silently defeat', () => {
    const bare = [...css.matchAll(/(^|[^.\w-])\.dash-app\s*\{[^}]*overflow[^}]*\}/gm)];
    expect(bare).toHaveLength(0);
  });
});
