// The PDF-proxy URL gate is the SSRF boundary, so it gets a test: only allowlisted https PDF
// hosts are proxied (everything else stays a plain link, never fetched by our server).
import { describe, it, expect } from 'vitest';
import { safePdfUrl, pdfProxyUrl } from '../src/live/doc/safeUrl';

describe('safePdfUrl', () => {
  it('accepts https PDFs on allowlisted hosts', () => {
    expect(safePdfUrl('https://bitcoin.org/bitcoin.pdf')).toBe('https://bitcoin.org/bitcoin.pdf');
    expect(safePdfUrl('https://arxiv.org/pdf/2401.00001')).toBeTruthy();
    expect(safePdfUrl('https://www.w3.org/TR/spec.pdf')).toBeTruthy();
  });

  it('rejects non-allowlisted hosts, non-https, spoofed subdomains, and junk', () => {
    expect(safePdfUrl('https://evil.example.com/x.pdf')).toBeUndefined();
    expect(safePdfUrl('http://bitcoin.org/bitcoin.pdf')).toBeUndefined(); // not https
    expect(safePdfUrl('https://bitcoin.org.attacker.com/x.pdf')).toBeUndefined(); // subdomain spoof
    expect(safePdfUrl('https://10.0.0.1/internal.pdf')).toBeUndefined(); // private host
    expect(safePdfUrl('not a url')).toBeUndefined();
    expect(safePdfUrl(undefined)).toBeUndefined();
  });

  it('builds a same-origin proxy url with the target encoded', () => {
    expect(pdfProxyUrl('https://bitcoin.org/bitcoin.pdf')).toBe(
      '/pdf?url=https%3A%2F%2Fbitcoin.org%2Fbitcoin.pdf',
    );
  });
});
