// A gauge's band sits inside the dial, under the number — room for one short word. The model also
// writes phrases there ("Moderate-high with 700+ score"), which wrapped across the ring, so a band
// longer than the disc holds stands beside the dial instead, and is never dropped.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BAND_INSIDE_MAX, Gauge } from '../src/canvas/Gauge';

const html = (band: string, driver?: string) =>
  renderToStaticMarkup(
    <Gauge title="Approval confidence" value={75} band={band} driver={driver} />,
  );
const centre = (markup: string) =>
  /<div class="gauge-center">([\s\S]*?)<\/div><\/div>/.exec(markup)?.[1] ?? '';

describe('gauge band', () => {
  it('keeps a short band inside the dial', () => {
    const out = html('Elevated');
    expect(centre(out)).toContain('Elevated');
    expect(out).not.toContain('risk-side');
  });

  it('moves a phrase beside the dial, ahead of the driver', () => {
    const band = 'Moderate-high with 700+ score';
    expect(band.length).toBeGreaterThan(BAND_INSIDE_MAX);
    const out = html(band, 'Most issuers approve at this score.');
    expect(centre(out)).not.toContain(band);
    const side = /<div class="risk-side">([\s\S]*)<\/div><\/div>/.exec(out)?.[1] ?? '';
    expect(side.indexOf(band)).toBeGreaterThan(-1);
    expect(side.indexOf(band)).toBeLessThan(side.indexOf('Most issuers'));
  });

  it('holds a band at the limit inside', () => {
    expect(centre(html('x'.repeat(BAND_INSIDE_MAX)))).toContain('x'.repeat(BAND_INSIDE_MAX));
  });
});
