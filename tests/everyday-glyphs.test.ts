import { describe, it, expect } from 'vitest';
import { Icon } from '../src/icons/icons';
import { weatherGlyph, transitGlyph } from '../src/canvas/blocks/everyday/glyphs';

describe('weatherGlyph', () => {
  it('maps natural-language conditions to the right glyph', () => {
    expect(weatherGlyph('partly cloudy')).toBe(Icon.cloud);
    expect(weatherGlyph('Rainy')).toBe(Icon.rain);
    expect(weatherGlyph('thunderstorm')).toBe(Icon.storm);
    expect(weatherGlyph('light snow')).toBe(Icon.snow);
    expect(weatherGlyph('clear skies')).toBe(Icon.sun);
    expect(weatherGlyph('windy')).toBe(Icon.wind);
  });
  it('honours an exact canonical key', () => {
    expect(weatherGlyph('rain')).toBe(Icon.rain);
  });
  it('falls back to sun for unknown/empty input', () => {
    expect(weatherGlyph(undefined)).toBe(Icon.sun);
    expect(weatherGlyph('???')).toBe(Icon.sun);
  });
});

describe('transitGlyph', () => {
  it('maps natural-language modes to the right glyph', () => {
    expect(transitGlyph('walking')).toBe(Icon.walk);
    expect(transitGlyph('light rail')).toBe(Icon.train);
    expect(transitGlyph('Metro')).toBe(Icon.subway);
    expect(transitGlyph('driving')).toBe(Icon.car);
    expect(transitGlyph('bicycle')).toBe(Icon.bike);
    expect(transitGlyph('ferry')).toBe(Icon.ferry);
    expect(transitGlyph('bus')).toBe(Icon.bus);
  });
  it('falls back to walk for unknown/empty input', () => {
    expect(transitGlyph(undefined)).toBe(Icon.walk);
    expect(transitGlyph('teleport')).toBe(Icon.walk);
  });
});
