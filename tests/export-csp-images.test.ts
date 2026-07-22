// Regression: exports rasterize through modern-screenshot, which inlines a cross-origin image by
// FETCHING it. The CSP allowed the map-tile and photo hosts under `img-src` (so Leaflet and photo
// blocks painted fine on screen) but not under `connect-src` — so every one of those fetches was
// blocked at export time and the image came out BLANK in the PDF/PPTX. A geomap figure exported as
// an empty grey box with markers floating on nothing, and nobody noticed because the preview was
// perfect. Any host we can paint, we must also be able to fetch, or the export silently loses it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The directive's source list, minus the keywords/schemes that aren't fetchable origins. */
function origins(csp: string, directive: string): string[] {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `));
  if (!found) throw new Error(`no ${directive} directive in the CSP`);
  return found
    .slice(directive.length + 1)
    .split(/\s+/)
    .filter((token) => token.startsWith('http'));
}

describe('Content-Security-Policy — every image host the raster export must inline', () => {
  const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];

  it('declares the policy in index.html', () => {
    expect(csp).toBeTruthy();
  });

  it('allows connect-src to fetch every remote host img-src can paint', () => {
    const imgHosts = origins(csp!, 'img-src');
    const connectHosts = new Set(origins(csp!, 'connect-src'));
    expect(imgHosts.length).toBeGreaterThan(0);

    const unfetchable = imgHosts.filter((host) => !connectHosts.has(host));
    // A host here renders on screen and then comes out blank in every exported PDF/PPTX.
    expect(unfetchable).toEqual([]);
  });

  it('still covers the map tiles specifically — the figure that first exposed this', () => {
    expect(origins(csp!, 'connect-src')).toContain('https://*.basemaps.cartocdn.com');
  });
});
