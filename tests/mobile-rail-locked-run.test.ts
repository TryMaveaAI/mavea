// On a phone the session rail is a 45px "This session" band above the dock. A locked run (a replay,
// the walkthrough) makes everything but its transport inert, so that band would be a dead control
// sitting against whatever the run shows — the band and the rail go while the run holds the surface.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src/styles/mobile.css'), 'utf8');

describe('mobile session band during a locked run', () => {
  it('gives the band back and hides the closed rail', () => {
    expect(css).toMatch(
      /\[data-scripted-run='locked'\]:not\(:has\(\.side-rail\.chat-open\)\)\s*\{\s*--mobile-rail-h:\s*0px;/,
    );
    expect(css).toMatch(
      /\[data-scripted-run='locked'\] \.side-rail:not\(\.chat-open\)\s*\{\s*display:\s*none;/,
    );
  });
});
