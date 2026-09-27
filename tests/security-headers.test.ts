import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
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

// What a path actually receives on Cloudflare Pages: every matching rule applies in file order, a
// rule's `! Name` lines detach before its own values are set, and a header set twice is joined with
// a comma. Reading one rule in isolation is how `no-cache` rode along with the immutable lifetime
// and a second `frame-ancestors` policy blocked the PDF reader without any test noticing.
const rules = headers
  .split(/\n(?=\/)/)
  .map((block) => block.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')))
  .filter(([pattern]) => pattern?.startsWith('/'));

function valuesOnPages(path: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [pattern = '', ...lines] of rules) {
    const re = new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
    );
    if (!re.test(path)) continue;
    for (const l of lines) {
      if (l.trim().startsWith('!')) out.delete(l.trim().slice(1).trim().toLowerCase());
    }
    for (const l of lines) {
      const at = l.indexOf(':');
      if (l.trim().startsWith('!') || at < 0) continue;
      const name = l.slice(0, at).trim().toLowerCase();
      out.set(name, [...(out.get(name) ?? []), l.slice(at + 1).trim()]);
    }
  }
  return out;
}

const resolvedOnPages = (path: string) =>
  new Map([...valuesOnPages(path)].map(([name, values]) => [name, values.join(', ')]));

// One concrete path per rule, so a rule added later is covered without editing this list.
const everyRulePath = ['/', '/live', ...rules.map(([pattern = '']) => pattern.replace(/\*/g, 'x'))];

describe('what each path receives once every matching rule has applied', () => {
  it('never sets a header twice on any path, and never loses one /* promises', () => {
    const global = [...valuesOnPages('/').keys()];
    for (const path of everyRulePath) {
      const got = valuesOnPages(path);
      for (const [name, values] of got) expect(values, `${path} ${name}`).toHaveLength(1);
      for (const name of global) expect(got.has(name), `${path} ${name}`).toBe(true);
    }
  });

  it('lets only the bundled PDFs be framed, and only by the app itself', () => {
    const pdf = resolvedOnPages('/demo-assets/pdf/primer.pdf');
    expect(pdf.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(pdf.get('content-security-policy')).toBe("frame-ancestors 'self'");
    for (const path of ['/', '/index.html', '/demo-assets/other.png', '/assets/app.js']) {
      const got = resolvedOnPages(path);
      expect(got.get('x-frame-options'), path).toBe('DENY');
      expect(got.get('content-security-policy'), path).toMatch(/frame-ancestors 'none'$/);
    }
  });

  it('keeps the frameable folder to PDFs, since its only CSP is frame-ancestors', () => {
    const dir = join(__dirname, '../public/demo-assets/pdf');
    const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) =>
      e.isFile(),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file.name).toMatch(/\.pdf$/);
  });

  it('gives each cached path exactly its own lifetime', () => {
    expect(resolvedOnPages('/').get('cache-control')).toBe('no-cache');
    expect(resolvedOnPages('/index.html').get('cache-control')).toBe('no-cache');
    expect(resolvedOnPages('/assets/app-abc.js').get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    for (const path of ['/fonts/a.woff2', '/semantic/x.json', '/demo-assets/pdf/primer.pdf']) {
      expect(resolvedOnPages(path).get('cache-control'), path).toMatch(/^public, max-age=\d+/);
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

describe('the page cannot post to a model or search API directly', () => {
  // Every adapter reaches its provider through a same-origin proxy, so a provider host in
  // connect-src does nothing but give injected script a write-capable place to send a stolen key.
  const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
  const policy = html.split('Content-Security-Policy"')[1] ?? '';
  const connectSrc = /connect-src ([^;"]+)/.exec(policy)?.[1];

  it('keeps every provider host out of connect-src', () => {
    expect(connectSrc).toContain("'self'");
    for (const host of [
      'api.anthropic.com',
      'api.openai.com',
      'generativelanguage.googleapis.com',
      'openrouter.ai',
      'api.x.ai',
      'api.search.brave.com',
      'api.tavily.com',
    ]) {
      expect(connectSrc).not.toContain(host);
    }
  });
});
