// Security + correctness suite for the svgblock sanitizer. LLM-generated SVG is untrusted, so
// these tests assert that every known SVG XSS / exfiltration vector is neutralized and that
// legitimate drawing markup survives intact. If a vector slips through, this suite must fail.
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../src/canvas/blocks/media/sanitizeSvg';

/** Parse sanitized output back into a DOM for structural assertions. */
function parse(out: string): SVGElement {
  const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
  return doc.documentElement as unknown as SVGElement;
}

describe('sanitizeSvg — rejects unusable input', () => {
  it('returns null for non-strings, empty, and whitespace', () => {
    expect(sanitizeSvg(undefined)).toBeNull();
    expect(sanitizeSvg(null)).toBeNull();
    expect(sanitizeSvg(42)).toBeNull();
    expect(sanitizeSvg('')).toBeNull();
    expect(sanitizeSvg('   ')).toBeNull();
  });

  it('returns null when the root element is not <svg>', () => {
    expect(sanitizeSvg('<div>nope</div>')).toBeNull();
    expect(sanitizeSvg('<html><body>x</body></html>')).toBeNull();
  });

  it('returns null for malformed XML', () => {
    expect(sanitizeSvg('<svg><circle></svg>')).toBeNull(); // unclosed tag, strict XML
  });

  it('rejects an oversized payload (DoS guard)', () => {
    const huge = '<svg viewBox="0 0 10 10">' + '<rect/>'.repeat(1000) + '</svg>';
    expect(sanitizeSvg(huge)).toBeNull();
  });

  it('rejects a too-complex figure by element count, even when under the byte cap', () => {
    // 81 elements is only a few hundred bytes — well under MAX_INPUT — but past the accuracy and
    // readability budget. A richer visual belongs in a purpose-built component.
    const dense = '<svg viewBox="0 0 10 10">' + '<rect/>'.repeat(81) + '</svg>';
    expect(dense.length).toBeLessThan(6_000); // proves it's the count guard, not the byte guard
    expect(sanitizeSvg(dense)).toBeNull();
    // A normal small figure passes the budget.
    const ok = '<svg viewBox="0 0 10 10">' + '<rect/>'.repeat(20) + '</svg>';
    expect(sanitizeSvg(ok)).not.toBeNull();
  });

  it('rejects DOCTYPE / ENTITY definitions (XXE + billion-laughs guard)', () => {
    const xxe =
      '<!DOCTYPE svg [<!ENTITY x "blow">]><svg viewBox="0 0 10 10"><text>&x;</text></svg>';
    expect(sanitizeSvg(xxe)).toBeNull();
    const ent = '<!ENTITY foo "bar"><svg viewBox="0 0 1 1"></svg>';
    expect(sanitizeSvg(ent)).toBeNull();
  });
});

describe('sanitizeSvg — neutralizes script execution', () => {
  it('strips <script> elements', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><circle r="5"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('<script');
    expect(out!.toLowerCase()).not.toContain('alert');
    expect(out).toContain('<circle'); // legitimate sibling survives
  });

  it('strips inline event handlers (onload, onclick, …)', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="5" height="5" onclick="evil()"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('onload');
    expect(out!.toLowerCase()).not.toContain('onclick');
    expect(out!.toLowerCase()).not.toContain('alert');
  });

  it('strips javascript: protocol in any attribute', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect fill="javascript:alert(1)" width="5" height="5"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('javascript:');
  });
});

describe('sanitizeSvg — blocks HTML injection / namespace escape', () => {
  it('strips <foreignObject> and its HTML payload (well-formed input)', () => {
    // Well-formed XML so the strict parser accepts it — this exercises the element-stripping
    // path. (A malformed payload is rejected outright; see the "malformed XML" case above.)
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">hi</div></foreignObject><circle r="5"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('foreignobject');
    expect(out!.toLowerCase()).not.toContain('onclick');
    expect(out!.toLowerCase()).not.toContain('<div');
    expect(out).toContain('<circle');
  });

  it('strips <iframe>', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 10 10"><iframe src="https://evil.test"/></svg>');
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('<iframe');
  });
});

describe('sanitizeSvg — prevents external resource loads (exfiltration / SSRF)', () => {
  it('strips <image> entirely', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><image href="https://evil.test/track.png" width="10" height="10"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('<image');
    expect(out!.toLowerCase()).not.toContain('evil.test');
  });

  it('strips external href/xlink:href on <use>, keeps fragment refs', () => {
    const external = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><use href="https://evil.test/x.svg#a"/></svg>',
    );
    expect(external).not.toBeNull();
    expect(external!.toLowerCase()).not.toContain('evil.test');

    const fragment = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><defs><rect id="a" width="5" height="5"/></defs><use href="#a"/></svg>',
    );
    expect(fragment).not.toBeNull();
    expect(fragment).toContain('#a'); // same-document reference is preserved
  });

  it('strips <a> links (phishing / navigation vector)', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><a href="https://evil.test"><circle r="5"/></a></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('evil.test');
    expect(out!.toLowerCase()).not.toMatch(/<a[\s>]/);
  });

  it('strips a fill that loads an external url(), keeps url(#fragment)', () => {
    const external = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect fill="url(https://evil.test/x)" width="5" height="5"/></svg>',
    );
    expect(external).not.toBeNull();
    expect(external!.toLowerCase()).not.toContain('evil.test');

    const fragment = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0%" stop-color="var(--presence)"/></linearGradient></defs><rect fill="url(#g)" width="5" height="5"/></svg>',
    );
    expect(fragment).not.toBeNull();
    expect(fragment).toContain('url(#g)');
  });
});

describe('sanitizeSvg — strips CSS injection vectors', () => {
  it('strips <style> elements', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><style>@import url(https://evil.test/x.css);</style><circle r="5"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('<style');
    expect(out!.toLowerCase()).not.toContain('@import');
    expect(out!.toLowerCase()).not.toContain('evil.test');
  });

  it('strips a style attribute that loads externally, keeps a safe token style', () => {
    const danger = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect style="fill:url(https://evil.test/x)" width="5" height="5"/></svg>',
    );
    expect(danger).not.toBeNull();
    expect(danger!.toLowerCase()).not.toContain('evil.test');

    const safe = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect style="fill:var(--presence)" width="5" height="5"/></svg>',
    );
    expect(safe).not.toBeNull();
    expect(safe).toContain('var(--presence)');
  });
});

describe('sanitizeSvg — strips animation abuse', () => {
  it('strips <animate> and <set>', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect width="5" height="5"><animate attributeName="x" to="100"/><set attributeName="onload" to="alert(1)"/></rect></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('<animate');
    expect(out!.toLowerCase()).not.toContain('<set');
    expect(out!.toLowerCase()).not.toContain('onload');
  });
});

describe('sanitizeSvg — enforces design-token colors (light/dark correctness)', () => {
  it('rewrites a hardcoded fill instead of leaving SVG default black', () => {
    // The exact shape of the reported bug: a model-drawn black box with equally dark text on
    // top reads as a solid black rectangle in light mode — neither the box nor the label visible.
    const out = sanitizeSvg(
      '<svg viewBox="0 0 100 50"><rect width="80" height="40" fill="black"/>' +
        '<text x="10" y="25" fill="#111">label</text></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('"black"');
    expect(out!.toLowerCase()).not.toContain('#111');
    // A shape fill falls back to the card-surface token, text to the primary-text token — the
    // same pairing the design system itself uses, so it always has contrast in both themes.
    expect(out).toContain('fill="var(--surface-card)"');
    expect(out).toContain('fill="var(--text-primary)"');
  });

  it('rewrites a non-token stroke and a raw hex/rgb color of any form', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="#fff"/>' +
        '<circle r="4" fill="rgb(0,0,0)"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('#fff');
    expect(out!.toLowerCase()).not.toContain('rgb(');
    expect(out).toContain('var(--text-secondary)'); // stroke fallback
    expect(out).toContain('var(--surface-card)'); // non-text fill fallback
  });

  it('keeps safe non-token keywords (none, currentColor, transparent)', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="none" stroke="currentColor"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out).toContain('fill="none"');
    expect(out!.toLowerCase()).toContain('stroke="currentcolor"');
  });

  it('rewrites an off-token color hidden inside a style attribute', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><rect width="5" height="5" style="fill:black;stroke:#000"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).not.toContain('style=');
  });
});

describe('sanitizeSvg — preserves legitimate drawing markup', () => {
  it('keeps shapes, text, gradients, and design-token colors', () => {
    const input =
      '<svg viewBox="0 0 100 50">' +
      '<defs><linearGradient id="g"><stop offset="0%" stop-color="var(--presence)"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="40" height="40" fill="url(#g)"/>' +
      '<circle cx="60" cy="20" r="15" fill="var(--insight)"/>' +
      '<line x1="0" y1="0" x2="100" y2="50" stroke="var(--warning)" stroke-width="2"/>' +
      '<text x="10" y="45" fill="var(--text-secondary)">label</text>' +
      '</svg>';
    const out = sanitizeSvg(input);
    expect(out).not.toBeNull();
    const svg = parse(out!);
    expect(svg.querySelector('rect')).not.toBeNull();
    expect(svg.querySelector('circle')).not.toBeNull();
    expect(svg.querySelector('line')).not.toBeNull();
    expect(svg.querySelector('text')?.textContent).toBe('label');
    expect(svg.querySelector('linearGradient')).not.toBeNull();
    expect(out).toContain('var(--presence)');
    expect(out).toContain('var(--insight)');
  });

  it('enforces responsive sizing: drops fixed width/height, sets width=100%, keeps viewBox', () => {
    const out = sanitizeSvg(
      '<svg width="800" height="600" viewBox="0 0 800 600"><circle r="5"/></svg>',
    );
    expect(out).not.toBeNull();
    const svg = parse(out!);
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');
  });

  it('rejects a missing or invalid viewBox instead of inventing geometry', () => {
    expect(sanitizeSvg('<svg><circle r="5"/></svg>')).toBeNull();
    expect(sanitizeSvg('<svg viewBox="0 0 NaN 100"><circle r="5"/></svg>')).toBeNull();
    expect(sanitizeSvg('<svg viewBox="0 0 0 100"><circle r="5"/></svg>')).toBeNull();
  });

  it('rejects an unreadably dense label set', () => {
    const dense =
      '<svg viewBox="0 0 100 100">' +
      Array.from({ length: 21 }, (_, i) => `<text x="0" y="${i}">${i}</text>`).join('') +
      '</svg>';
    expect(sanitizeSvg(dense)).toBeNull();
  });

  it('strips comments and processing instructions', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><?xml-stylesheet href="https://evil.test/x.css"?><!-- note --><circle r="5"/></svg>',
    );
    expect(out).not.toBeNull();
    expect(out).not.toContain('<!--');
    expect(out!.toLowerCase()).not.toContain('xml-stylesheet');
    expect(out!.toLowerCase()).not.toContain('evil.test');
    expect(out).toContain('<circle');
  });
});
