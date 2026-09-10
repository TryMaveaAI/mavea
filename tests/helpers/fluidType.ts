// Source-scan helpers for the fluid type ramp. jsdom parses no stylesheet, so legibility guards
// read font sizes straight out of the CSS text — and since the ramp moved type onto tokens, a
// guard has to resolve `var(--fs-sm)` to a number before it can compare it with the 9px floor.
// The number it resolves to is the token's FLOOR (its size at the 320px viewport, before the
// reader's knob), because the floor is the only value a guard can promise at every width.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS = readFileSync(join(__dirname, '../../src/styles/tokens-base.css'), 'utf8');

/** The px floor of a ramp token (`--fs-sm` → 11.5), or undefined for a name not on the ramp. */
export function tokenFloorPx(token: string): number | undefined {
  const m = new RegExp(`${token}:\\s*clamp\\(\\s*calc\\(([\\d.]+)px`).exec(TOKENS);
  return m ? Number(m[1]) : undefined;
}

/** The smallest px a `font-size` value can render at (before the reader's knob): a literal px,
 *  the floor of a token, or the floor of a bounded clamp()/max(). NaN when nothing is stated. */
export function fontSizeFloorPx(value: string): number {
  const literal = /^\s*([\d.]+)px/.exec(value);
  if (literal) return Number(literal[1]);
  const token = /var\((--fs-[a-z0-9]+)/.exec(value);
  if (token) return tokenFloorPx(token[1]) ?? Number.NaN;
  const bounded = /^\s*(?:clamp|max)\(\s*([\d.]+)px/.exec(value);
  if (bounded) return Number(bounded[1]);
  return Number.NaN;
}

/** Every `font-size` (or `font` shorthand size term) declared in a stylesheet, resolved to its floor. */
export function declaredFontSizeFloors(css: string): number[] {
  const out: number[] = [];
  for (const m of css.matchAll(/font(?:-size)?:\s*([^;{}]+)/g)) {
    const value = m[1].trim();
    const size = /^font:/.test(m[0])
      ? (/(?:^|\s)((?:[\d.]+px|var\(--fs-[a-z0-9]+[^)]*\)|clamp\([^)]*\)))(?:\/|\s)/.exec(
          value + ' ',
        )?.[1] ?? '')
      : value;
    const px = fontSizeFloorPx(size);
    if (!Number.isNaN(px)) out.push(px);
  }
  return out;
}
