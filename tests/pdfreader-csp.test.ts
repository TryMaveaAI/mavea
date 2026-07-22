// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PDF reader CSP contract', () => {
  it('permits only same-origin frames at the browser policy boundary', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/(?:^|;)\s*frame-src 'self'\s*(?:;|$)/);
    expect(csp).not.toMatch(/frame-src[^;]*https?:|frame-src[^;]*\*/);
    expect(csp).toMatch(/(?:^|;)\s*object-src 'none'\s*(?:;|$)/);
  });
});
