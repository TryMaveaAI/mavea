import { describe, expect, it } from 'vitest';
import {
  altitudeRung,
  canvasPinch,
  isDeckRung,
  stepAltitude,
  ALTITUDE_LADDER,
  type Altitude,
} from '../src/live/altitude';

describe('altitude ladder', () => {
  it('orders rungs from the canvas out to the atlas', () => {
    expect(ALTITUDE_LADDER).toEqual(['canvas', 'chapters', 'breath', 'atlas']);
    expect(altitudeRung('canvas')).toBe(0);
    expect(altitudeRung('atlas')).toBe(3);
  });
});

describe('stepAltitude', () => {
  it('ascends one rung per pinch-out, all the way to the atlas', () => {
    expect(stepAltitude('canvas', 'out')).toBe('chapters');
    expect(stepAltitude('chapters', 'out')).toBe('breath');
    // This is the new rung the audit required: one past "one breath" → your whole history.
    expect(stepAltitude('breath', 'out')).toBe('atlas');
  });

  it('descends one rung per pinch-in, back to the canvas', () => {
    expect(stepAltitude('atlas', 'in')).toBe('breath');
    expect(stepAltitude('breath', 'in')).toBe('chapters');
    expect(stepAltitude('chapters', 'in')).toBe('canvas');
  });

  it('clamps at both ends (an over-pinch is a no-op)', () => {
    expect(stepAltitude('atlas', 'out')).toBe('atlas');
    expect(stepAltitude('canvas', 'in')).toBe('canvas');
  });
});

describe('isDeckRung', () => {
  it('matches exactly the two rungs the ZoomDeck renders', () => {
    const rungs: Altitude[] = ['canvas', 'chapters', 'breath', 'atlas'];
    expect(rungs.filter(isDeckRung)).toEqual(['chapters', 'breath']);
  });
});

describe('canvasPinch', () => {
  it('zooms the in-world camera while there is still room to zoom out', () => {
    expect(canvasPinch('out', false)).toBe('zoom-camera');
  });

  it('ascends a rung only once the camera is at its fit floor', () => {
    expect(canvasPinch('out', true)).toBe('ascend');
  });

  it('always stays in the camera when pinching in (diving toward an atom)', () => {
    expect(canvasPinch('in', false)).toBe('zoom-camera');
    expect(canvasPinch('in', true)).toBe('zoom-camera');
  });
});
