// surface-styles-consistency.test.ts — source-scan tripwires for the surface-stylesheet
// cleanup (every .css NOT under src/styles or src/canvas). Mirrors styles-consistency.test.ts.
//   1. Pill radii go through --r-full, never the literal 999px; stray standard 6/8/12px radii
//      go through --r-sm / --r-md. The one allowed literal is the Boardroom persona's
//      deliberately-sharp 6px corner (present.css), which is a stylistic one-off, not drift.
//   2. The two animations that previously lacked a prefers-reduced-motion fallback now have
//      one (gesture-track entry + the dashboards live-dot pulse).
//   3. The responsive fixes that stop narrow-viewport overflow are in place (fluid columns
//      with no hard floor, min()-guarded grid tracks, the welcome single-column breakpoint).
// No DOM needed — the cheapest durable guard against silent CSS drift on these surfaces.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', 'src');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// Every surface stylesheet touched by the cleanup (the task's edit scope).
const surfaceFiles = [
  'flagship/flagship.css',
  'gallery/gallery.css',
  'clip/reel/reel.css',
  'live/library.css',
  'live/livedock.css',
  'live/recap/recap.css',
  'live/memory/memory-graph.css',
  'live/turnstate/turnstate.css',
  'live/understand/understand.css',
  'live/rehearsal/rehearsal.css',
  'live/srs/srs-review.css',
  'live/annotate/annotate.css',
  'live/annotate/gesture-track.css',
  'live/ghost/ghost.css',
  'live/voice/voice.css',
  'live/dashboards/dashboards.css',
  'live/zoom/zoom.css',
  'live/atlas/atlas.css',
  'live/whisper/whisper.css',
  'live/present/present.css',
  'live/scrubber/scrubber.css',
  'live/scrubvoice/scrubvoice.css',
  'live/welcome/welcome.css',
];

describe('surface stylesheets — radius tokenization', () => {
  it('uses --r-full for pill radii: no literal 999px survives', () => {
    for (const f of surfaceFiles) {
      expect(read(f), `${f} still hardcodes 999px`).not.toMatch(/\b999px\b/);
    }
  });

  it('has no stray 6/8/12px border-radius literals (one allowed Boardroom-persona 6px)', () => {
    for (const f of surfaceFiles) {
      const css = read(f);
      const hits = css.match(/border-radius:\s*(?:6px|8px|12px)\s*;/g) ?? [];
      if (f === 'live/present/present.css') {
        // The Boardroom persona deliberately uses sharp 6px corners as part of its look.
        expect(hits.length, `${f} should keep only the persona 6px`).toBeLessThanOrEqual(1);
      } else {
        expect(hits.length, `${f} has a stray standard radius`).toBe(0);
      }
    }
  });
});

describe('surface stylesheets — reduced-motion fallbacks', () => {
  it('gesture-track guards its entry animation', () => {
    const css = read('live/annotate/gesture-track.css');
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    const block =
      css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\}\s*\}/)?.[0] ?? '';
    expect(block).toMatch(/\.gesture-track/);
    expect(block).toMatch(/animation:\s*none/);
  });

  it('dashboards pins the live dot when reduced motion is requested', () => {
    const css = read('live/dashboards/dashboards.css');
    const block =
      css.match(
        /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.dash-live-dot[\s\S]*?\}\s*\}/,
      )?.[0] ?? '';
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/opacity:\s*1/);
  });
});

describe('surface stylesheets — narrow-viewport overflow guards', () => {
  it('flagship column has no hard 320px floor that overflows tiny screens', () => {
    const css = read('flagship/flagship.css');
    expect(css).toMatch(/--fl-col:\s*min\(92vw,\s*1080px\)/);
    expect(css).toMatch(/--fl-col-wide:\s*min\(94vw,\s*1180px\)/);
    // hero title floor drops to 34px so it fits ~360px
    expect(css).toMatch(/font-size:\s*clamp\(34px,\s*7vw,\s*92px\)/);
  });

  it('gallery grid min()-guards its fixed track floor', () => {
    expect(read('gallery/gallery.css')).toMatch(
      /repeat\(auto-fill,\s*minmax\(min\(400px,\s*100%\),\s*1fr\)\)/,
    );
  });

  it('welcome starter grid collapses to one column on the narrowest phones', () => {
    const css = read('live/welcome/welcome.css');
    const block = css.match(/@media \(max-width: 430px\) \{[\s\S]*?\}\s*\}/)?.[0] ?? '';
    expect(block).toMatch(/\.starter-grid/);
    expect(block).toMatch(/grid-template-columns:\s*1fr/);
  });
});
