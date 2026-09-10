// The reading pane of a Deep Zoom is focused by script after every move so a screen reader hears
// where it landed. The pane is not operable, so the browser's default ring — drawn around the whole
// padded column — read as a stray box under every level. jsdom paints no stylesheet, so the pair is
// pinned at the source: the component still focuses the pane, and the sheet still quiets its ring.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('deep zoom focus ring', () => {
  it('focuses the current level after a move', () => {
    const app = read('src/live/deepzoom/DeepZoomApp.tsx');
    expect(app).toMatch(/querySelector<HTMLElement>\('\.dz-level\.is-current'\)\s*\?\.focus\(/);
  });

  it('draws no default ring around the focused level', () => {
    const css = read('src/live/deepzoom/deepzoom.css');
    expect(css).toMatch(/\.dz-level:focus\s*\{\s*outline:\s*none;\s*\}/);
  });
});
