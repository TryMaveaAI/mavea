// The category dropdowns must stay reachable on a SHORT viewport. The app shell is a fixed
// overflow:hidden box with no page scroll, so an uncapped menu doesn't get a scrollbar — its
// last items are silently clipped off the bottom edge. Two stylesheets both define .more-menu
// (the global top-bar chrome and the Live surface's own copy); the Live copy once shipped
// WITHOUT the height cap, which is exactly how "some of the menu was cut off" reached users.
// This pins both copies to the same bounded, scrollable contract.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SHEETS = ['src/styles/top-bar.css', 'src/live/voice/voice.css'];

describe('.more-menu height contract', () => {
  for (const sheet of SHEETS) {
    it(`${sheet} caps the menu and lets it scroll`, () => {
      const css = readFileSync(sheet, 'utf8');
      const block = css.match(/\.more-menu\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      expect(block, `${sheet} must define .more-menu`).not.toBe('');
      expect(block).toMatch(/max-height:\s*calc\(100dvh - 72px\)/);
      expect(block).toMatch(/overflow-y:\s*auto/);
    });
  }
});
