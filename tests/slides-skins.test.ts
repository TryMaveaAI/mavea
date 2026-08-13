import { describe, expect, it } from 'vitest';
import { SHARED_LAYOUTS } from '../src/slides/skins/layouts';
import { SLIDE_SKIN_ORDER, SLIDE_SKINS, suggestSlideSkin } from '../src/slides/skins/registry';
import type { SlideSkinId } from '../src/slides/skins/types';

const ALL = Object.keys(SLIDE_SKINS) as SlideSkinId[];
const SLIDE_KINDS = Object.keys(SHARED_LAYOUTS);

describe('slide skins', () => {
  it('registers exactly ten skins and orders all of them', () => {
    expect(ALL).toHaveLength(10);
    expect([...SLIDE_SKIN_ORDER].sort()).toEqual([...ALL].sort());
  });

  it('every skin has a well-formed token set, fonts, and an id that matches its key', () => {
    for (const id of ALL) {
      const s = SLIDE_SKINS[id];
      expect(s.id).toBe(id);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      // Every presentation uses the bundled OFL stylesheet; exports never depend on a font CDN.
      expect(s.fonts.href).toBe('/fonts/fonts.css');
      expect(s.fonts.display).toContain("'");
      expect(s.fonts.body).toContain("'");
      // Required colour tokens are present and non-empty.
      for (const k of [
        'paper',
        'ink',
        'muted',
        'faint',
        'accent',
        'tint',
        'rule',
        'ruleStrong',
        'track',
        'card',
        'darkSurface',
        'darkInk',
        'darkAccent',
      ] as const) {
        expect(s.tokens[k], `${id}.${k}`).toBeTruthy();
      }
      expect(typeof s.tokens.radius).toBe('number');
      expect(s.tokens.pad).toMatch(/px/);
      // Every override targets a real slide kind.
      for (const k of Object.keys(s.layouts)) expect(SLIDE_KINDS).toContain(k);
    }
  });

  it('keeps internal skin names out of Present, PDF, and PowerPoint slide chrome', () => {
    for (const id of ALL) {
      const skin = SLIDE_SKINS[id];
      expect(skin.brand.name).toBe('MAVÉA');
      expect(skin.brand.tagline).toBe('A Mavéa presentation');
      expect(skin.brand.name.toLocaleLowerCase()).not.toBe(skin.label.toLocaleLowerCase());
      expect(skin.brand.tagline.toLocaleLowerCase()).not.toContain(
        skin.archetype.toLocaleLowerCase(),
      );
    }
  });

  it('routes domains to a fitting skin and defaults to folio', () => {
    expect(suggestSlideSkin('Quarterly Finance Review')).toBe('meridian');
    expect(suggestSlideSkin('Clinical outcomes study')).toBe('lumen');
    expect(suggestSlideSkin('A research paper on cells')).toBe('press');
    expect(suggestSlideSkin('AI platform architecture')).toBe('cobalt');
    expect(suggestSlideSkin('Third-grade classroom')).toBe('sol');
    expect(suggestSlideSkin('Travel field guide')).toBe('terra');
    expect(suggestSlideSkin('Seed startup pitch')).toBe('north');
    expect(suggestSlideSkin(undefined)).toBe('folio');
    expect(suggestSlideSkin('a general overview of things')).toBe('folio');
  });

  it('keeps the optional depth tokens well-formed', () => {
    const HEX = /^#[0-9a-f]{6}$/i;
    for (const id of ALL) {
      const t = SLIDE_SKINS[id].tokens;
      if (t.accentInk !== undefined) expect(t.accentInk, `${id}.accentInk`).toMatch(HEX);
      if (t.flourish !== undefined) expect(t.flourish, `${id}.flourish`).toMatch(HEX);
      if (t.elevation !== undefined)
        expect(['flat', 'soft', 'raised', 'glow']).toContain(t.elevation);
      if (t.texture !== undefined) expect(['paper', 'linen']).toContain(t.texture);
      if (t.decorStrength !== undefined) {
        expect(t.decorStrength).toBeGreaterThan(0);
        expect(t.decorStrength).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps the flat skins flat (no shadow elevation on grid / press)', () => {
    for (const id of ['grid', 'press'] as const) {
      const e = SLIDE_SKINS[id].tokens.elevation;
      expect(['soft', 'raised', 'glow']).not.toContain(e);
    }
  });

  it('the text-grade accent clears WCAG AA (4.5:1) on every skin paper', () => {
    const lin = (c: number): number => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const luminance = (hex: string): number => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      if (!m) throw new Error(`not a hex colour: ${hex}`);
      const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const id of ALL) {
      const t = SLIDE_SKINS[id].tokens;
      const ratio = contrast(t.accentInk ?? t.accent, t.paper);
      expect(ratio, `${id}: ${t.accentInk ?? t.accent} on ${t.paper}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
