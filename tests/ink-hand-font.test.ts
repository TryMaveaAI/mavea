// The pen's handwriting is a SHIPPED font, not a hope that the reader's OS has one.
//
// The old stack — 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Marker Felt', cursive — resolved
// on macOS and Windows only. Everywhere else, including CI and the video-export rasterizer, it fell
// through to generic `cursive`, so the one typographic voice in the app that is meant to look
// handwritten rendered as a plain serif, differently on every machine. These lock the fix: the face
// is self-hosted, its bytes are the ones the provenance table vouches for, and every surface that
// draws the pen's hand asks for it first.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

const FILE = 'caveat-var-latin.woff2';

/** Every surface that draws Mavéa's written hand. A new one belongs in this list. */
const HAND_SITES = [
  'src/live/annotate/annotate.css', // the pen's notes + the "?" glyph on the Live canvas
  'src/live/prism/prism.css', // the same hand over a document page
  'src/clip/reel/templates/finishes/documentMarkup.tsx', // ...and in the rasterized reel
];

describe("the pen's hand is shipped, not borrowed from the OS", () => {
  it('fonts.css serves the face from our own origin', () => {
    const css = read('public/fonts/fonts.css');
    expect(css).toMatch(/font-family:\s*'Caveat'/);
    expect(css).toContain(`/fonts/${FILE}`);
    // A handwriting face with no `swap` blocks the very words it is meant to draw.
    const face = css.slice(css.indexOf("font-family: 'Caveat'"));
    expect(face.slice(0, face.indexOf('}'))).toContain('font-display: swap');
  });

  it('the shipped bytes are the ones the provenance table vouches for', () => {
    const bytes = readFileSync(join(root, 'public/fonts', FILE));
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(read('public/fonts/PROVENANCE.md')).toContain(sha);
  });

  it('the licence and its copyright notice ship with it', () => {
    expect(read('public/fonts/LICENSE.txt')).toContain('Caveat');
  });

  it('asks for the face the moment ink exists, so the export cannot bake fallback glyphs', () => {
    // A self-hosted face does not download until something using it is laid out, and
    // `font-display: swap` paints the fallback until it lands. `document.fonts.ready` cannot close
    // that race — it resolves against loads already pending, and nothing is pending until the note
    // renders (src/export/render/fonts.ts documents the same trap). The old system-font stack never
    // had this problem, so shipping a real face introduced it.
    const layer = read('src/live/annotate/AnnotationLayer.tsx');
    expect(layer).toMatch(/document\.fonts\?\.load\?\./);
    expect(layer).toMatch(/Caveat/);
    // ...and only once ink actually exists: an inkless canvas must not pay for the download.
    const body = layer.slice(layer.indexOf('if (spots.length === 0) return null;'));
    expect(body.slice(0, 120)).toContain('warmHand()');
  });

  it('every surface that draws the hand asks for the shipped face FIRST', () => {
    for (const site of HAND_SITES) {
      const src = read(site);
      const stack = /font-?[Ff]amily:\s*\n?\s*"?'Caveat'/.test(src);
      expect(stack, `${site} must name 'Caveat' first in its handwriting stack`).toBe(true);
      // The system names may stay as a pre-load fallback, but never alone.
      expect(src.match(/'Bradley Hand'/g)?.length ?? 0).toBeLessThanOrEqual(
        src.match(/'Caveat'/g)?.length ?? 0,
      );
    }
  });
});
