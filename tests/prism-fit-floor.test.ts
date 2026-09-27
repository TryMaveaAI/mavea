// Fitting a whole map into a short laptop's stage painted its cards at 3.6px. The camera now stops
// fitting at the scale that still sets a card's claim (the base title rule's token, at its floor)
// at the 9px legibility floor, and a map it cannot fit opens at its top for the reader to pan down.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { FIT_FLOOR, frameCamera } from '../src/live/prism/usePanZoom';

const tokens = readFileSync(join(__dirname, '..', 'src/styles/tokens-base.css'), 'utf8');
const prismCss = readFileSync(join(__dirname, '..', 'src/live/prism/prism.css'), 'utf8');

describe('map fit floor', () => {
  it('is 9px over the floor of the token the base claim-title rule is set in', () => {
    // The BASE rule, anchored at the start of a line — not a role variant that restyles it.
    const base = /^\.prism-claim-title\s*\{([^}]*)\}/m.exec(prismCss)?.[1] ?? '';
    const token = /font-size:\s*var\((--fs-[\w-]+)\)/.exec(base)?.[1];
    expect(token).toBeDefined();
    const floor = Number(
      new RegExp(`${token}:\\s*clamp\\(\\s*calc\\(([\\d.]+)px`).exec(tokens)?.[1],
    );
    expect(floor).toBeGreaterThan(0);
    expect(FIT_FLOOR).toBeCloseTo(9 / floor, 6);
  });

  it('frames a map that fits, centred, below the zoom-in cap', () => {
    const cam = frameCamera({ w: 1200, h: 800 }, { x: 0, y: 0, w: 600, h: 400 }, 64, 1.35);
    expect(cam.scale).toBeCloseTo(1.35);
    expect(cam.y).toBeCloseTo(400 - 200 * 1.35);
  });

  it('stops at the floor on a short stage and opens at the top of the map', () => {
    // The 1366x657 case: a 378px stage and a map ~1100 world px tall.
    const box = { x: 100, y: 50, w: 900, h: 1100 };
    const cam = frameCamera({ w: 1250, h: 378 }, box, 64, 1.35);
    expect(cam.scale).toBe(FIT_FLOOR);
    expect(cam.y + box.y * cam.scale).toBeCloseTo(32);
    expect(cam.x + (box.x + box.w / 2) * cam.scale).toBeCloseTo(625);
  });
});

describe('map toolbar', () => {
  it('wraps its action rows from one edge, not ragged from the end', () => {
    const rule = /\.prism-foot-actions\s*\{[^}]*\}/.exec(prismCss)?.[0] ?? '';
    expect(rule).toMatch(/justify-content:\s*flex-start/);
  });
});
