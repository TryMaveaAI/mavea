import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Five protections cannot be expressed in a <meta> tag — they exist only as response headers, so
// they have to come from whatever serves dist/. That made them easy to lose: they lived in a deploy
// config for a platform the project never actually used, and when that config was (correctly)
// deleted as dead, the headers went with it and nothing noticed. A voice app quietly shipping
// without `Permissions-Policy: microphone` or frame protection is not a footnote.
//
// public/_headers is copied verbatim into the build by Vite and is read directly by Cloudflare Pages
// and Netlify. This is the tripwire that keeps it honest.
const headers = readFileSync(join(__dirname, '../public/_headers'), 'utf8');
const deploymentGate = readFileSync(join(__dirname, '../scripts/check-deployment.mjs'), 'utf8');

describe('security response headers ship with the build', () => {
  it('refuses to be framed — clickjacking a voice app means clickjacking a mic prompt', () => {
    expect(headers).toMatch(/X-Frame-Options:\s*DENY/i);
    expect(headers).toMatch(/frame-ancestors\s+'none'/i);
  });

  it('limits the reader exception to bundled PDF assets on the same origin', () => {
    const start = headers.indexOf('/demo-assets/pdf/*');
    const tail = start >= 0 ? headers.slice(start) : '';
    const nextRule = tail.slice(1).search(/\n\//);
    const block = nextRule >= 0 ? tail.slice(0, nextRule + 1) : tail;
    expect(block).toMatch(/X-Frame-Options:\s*SAMEORIGIN/i);
    expect(block).toMatch(/frame-ancestors\s+'self'/i);
    expect(block).toMatch(/Cross-Origin-Resource-Policy:\s*same-origin/i);
    expect(block).toMatch(/Content-Disposition:\s*inline/i);
  });

  it('keeps the microphone same-origin, and denies what we never use', () => {
    // The real directive line, not the prose above it that happens to name the header.
    const line =
      headers
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .find((l) => /Permissions-Policy:/i.test(l)) ?? '';
    expect(line).toMatch(/microphone=\(self\)/);
    expect(line).toMatch(/camera=\(\)/);
    expect(line).toMatch(/geolocation=\(\)/);
  });

  it('pins HTTPS — the user’s own API keys travel over this connection', () => {
    expect(headers).toMatch(/Strict-Transport-Security:\s*max-age=\d{7,}/i);
  });

  it('sets nosniff and a private referrer policy', () => {
    expect(headers).toMatch(/X-Content-Type-Options:\s*nosniff/i);
    expect(headers).toMatch(/Referrer-Policy:\s*strict-origin-when-cross-origin/i);
  });

  it('applies them to every path, not just one', () => {
    expect(headers).toMatch(/^\/\*$/m);
  });

  it('revalidates HTML and gives content-hashed assets a one-year immutable lifetime', () => {
    expect(headers).toMatch(/^\/\*[\s\S]*?Cache-Control:\s*no-cache/im);
    expect(headers).toMatch(
      /^\/assets\/\*[\s\S]*?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/im,
    );
  });

  it('bounds stable-name static caches instead of incorrectly marking them immutable', () => {
    for (const path of ['fonts', 'semantic', 'demo-assets']) {
      const block = headers.match(new RegExp(`^/${path}/\\*[\\s\\S]*?(?=^/|\\z)`, 'im'))?.[0] ?? '';
      expect(block).toMatch(/Cache-Control:\s*public,\s*max-age=\d+/i);
      expect(block).toMatch(/stale-while-revalidate=\d+/i);
      expect(block).not.toMatch(/immutable/i);
    }
  });
});

describe('the post-deploy transport gate verifies behavior instead of config claims', () => {
  it('requires the plaintext origin to permanently upgrade to the same HTTPS host', () => {
    expect(deploymentGate).toContain("plaintext.protocol = 'http:'");
    expect(deploymentGate).toContain('[301, 308]');
    expect(deploymentGate).toContain('redirectTarget.host !== base.host');
  });

  it('negotiates HTTP/2 over TLS 1.3 or newer', () => {
    expect(deploymentGate).toContain("'--http2'");
    expect(deploymentGate).toContain("'--tlsv1.3'");
    expect(deploymentGate).toContain("'%{http_version}'");
  });

  it('can fail closed unless a real HTTP/3-only request completes', () => {
    expect(deploymentGate).toContain("args.includes('--require-http3')");
    expect(deploymentGate).toContain("'--http3-only'");
    expect(deploymentGate).toContain('real QUIC negotiation not proven');
  });

  it('bounds every transport probe instead of hanging the release job', () => {
    expect(deploymentGate).toContain('AbortSignal.timeout(20_000)');
    expect(deploymentGate).toContain("'--connect-timeout'");
    expect(deploymentGate).toContain("'--max-time'");
  });
});
