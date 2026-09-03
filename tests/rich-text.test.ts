// rich-text.test.ts — proves the render-boundary sanitizer strips the entire XSS surface
// while keeping the formatting real content uses. These are the vectors a prompt-injected
// or adversarial model could try to land through a RAW_TEXT field rendered as HTML.
import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from '../src/lib/richText';

describe('sanitizeRichText — strips the dangerous, keeps the safe', () => {
  it('drops <script> but keeps its text inert (never executes)', () => {
    const out = sanitizeRichText('hi <script>window.__x=1</script> there');
    expect(out).not.toContain('<script');
    expect(out).toContain('hi ');
    expect(out).toContain('there');
  });

  it('removes event-handler attributes', () => {
    const out = sanitizeRichText('<span onclick="steal()" onmouseover="x()">tap</span>');
    expect(out).not.toMatch(/onclick|onmouseover/i);
    expect(out).toContain('tap');
    expect(out).toContain('<span>'); // tag kept, attribute gone
  });

  it('unwraps <img onerror=…> entirely (no tag, no attribute survives)', () => {
    const out = sanitizeRichText('<img src=x onerror="alert(1)">caption');
    expect(out).not.toMatch(/<img|onerror|alert/i);
    expect(out).toContain('caption');
  });

  it('drops <a href=javascript:…> but keeps the link text', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click me</a>');
    expect(out).not.toMatch(/href|javascript:/i);
    expect(out).toContain('click me');
  });

  it('strips <iframe>/<style>/<object> and data: payloads', () => {
    const out = sanitizeRichText(
      '<iframe src="data:text/html,<script>x</script>"></iframe><style>*{}</style>ok',
    );
    expect(out).not.toMatch(/<iframe|<style|<object|data:/i);
    expect(out).toContain('ok');
  });

  it('keeps the allow-listed formatting tags and the highlight classes', () => {
    const out = sanitizeRichText(
      '<strong>bold</strong> <span class="k">const</span><br><ul><li>one</li></ul>',
    );
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<span class="k">const</span>');
    expect(out).toContain('<br>');
    expect(out).toContain('<li>one</li>');
  });

  it('drops a class the renderer does not use, keeping the tag and its text', () => {
    // A class here is chosen by the model; an app class would let a formatting field borrow
    // layout or overlay styling it was never meant to reach.
    const out = sanitizeRichText('<span class="live-dock topbar">gotcha</span>');
    expect(out).toBe('<span>gotcha</span>');
    const mixed = sanitizeRichText('<span class="k live-dock">const</span>');
    expect(mixed).toBe('<span class="k">const</span>');
  });

  it('flattens markup nested past the depth cap instead of recursing the render path', () => {
    // Serializing is recursive, so nesting depth is stack depth — capped, the words still land.
    const deep = '<b>'.repeat(400) + 'bottom' + '</b>'.repeat(400);
    let out = '';
    expect(() => (out = sanitizeRichText(deep))).not.toThrow();
    expect(out).toContain('bottom');
    expect(out.match(/<b>/g)).toHaveLength(24);
  });

  it('cuts oversized input rather than parsing all of it', () => {
    const huge = 'x'.repeat(50_000);
    const out = sanitizeRichText(`<b>${huge}</b>`);
    expect(out.length).toBeLessThan(huge.length);
    expect(out).toContain('xxx');
  });

  it('escapes a plain string with no markup', () => {
    expect(sanitizeRichText('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });

  it('survives malformed / unclosed / nested markup without throwing', () => {
    expect(() => sanitizeRichText('<b><i>x</b> <span class="a><script>')).not.toThrow();
    const out = sanitizeRichText('<b><i>deep</i></b>');
    expect(out).toContain('deep');
  });

  it('handles empty / whitespace input', () => {
    expect(sanitizeRichText('')).toBe('');
    expect(sanitizeRichText('   ')).toBe('   ');
  });

  it('coerces a non-string runtime value instead of throwing', () => {
    // The type says `string` (every caller is an HtmlString field by contract), but the generic
    // coercer that fills these props from loose model JSON only checks presence, not scalar
    // type — a component whose HtmlString-typed field the model fills with a bare number must
    // degrade to that number's text, the same way the raw `{ __html: value }` pattern this
    // sanitizer replaced would have (the DOM's own innerHTML setter stringifies).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proving the runtime boundary, not the type
    expect(sanitizeRichText(50 as any)).toBe('50');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeRichText(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeRichText(undefined as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeRichText(true as any)).toBe('true');
  });
});
