# Production delivery contract

Mavéa’s build and its host have separate responsibilities. The repository can guarantee minified,
content-hashed assets and safe defaults. Only the deployed edge can guarantee TLS, HTTP/2, HTTP/3,
compression, geographic latency, and response headers. Do not claim those protocols until the
public URL passes the post-deploy gate.

This repository is currently designed for local and self-hosted operation. A public operator must
also provide accurate operator identity, terms, privacy, retention, deletion, security, cookie,
provider, and contact disclosures for its actual topology. Shipping the static files does not make
the repository owners the operator of someone else's deployment.

## Required edge behavior

- Serve HTTPS only with TLS 1.3 available and redirect HTTP to HTTPS.
- Negotiate HTTP/2 and advertise HTTP/3 over QUIC with `Alt-Svc: h3=":443"`. Test a real HTTP/3
  request from a QUIC-capable runner; an `Alt-Svc` header alone is only an advertisement.
- Compress HTML, JavaScript, CSS, JSON, SVG, and WASM using Brotli where supported, with gzip as
  fallback and `Vary: Accept-Encoding`. Do not recompress images, fonts, PDFs, or video.
- Serve `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`. Those names contain a
  content hash. Serve `/` and `/index.html` with `no-cache` so a deploy cannot strand clients on an
  old asset graph. Stable-name fonts and demo data use bounded freshness plus
  `stale-while-revalidate`; do not mark them immutable.
- Do not add an application service-worker cache for build assets. The audited HTTP cache already
  handles them, while a second cache risks stale deploys and duplicate storage. `/sw.js` is a
  temporary retirement worker for older installations and intentionally has no fetch handler.
- Preserve every security header in `public/_headers`, including the header-level
  `Content-Security-Policy: frame-ancestors 'none'`; a meta CSP cannot express `frame-ancestors`.
- Put the same-origin `/llm`, `/search`, `/actions`, `/tts`, `/stt`, and `/pdf` forwarders behind
  bounded request sizes, timeouts, concurrency/rate limits, and origin/authentication checks. A
  static host without these forwarders is not a complete Live deployment.
- Keep origin logs free of request bodies and authorization headers. BYOK prompts and keys must not
  enter CDN analytics, error pages, or access logs.

Cloudflare Pages and Netlify consume `public/_headers` directly. Other hosts must translate it into
their own response-header configuration. Modern CDNs normally provide HTTP/2, HTTP/3, Brotli, and
regional edge caching; verify the actual response rather than relying on a plan description.

## Release probe

After every production deploy, run from each launch geography:

```sh
pnpm check:deployment -- https://app.example.com --budget-ms 150 --require-http3
```

The probe requires a permanent HTTP→HTTPS redirect, TLS 1.3+, the security headers, one-year
immutable hashed assets, compression, HTTP/2+, HTTP/3 advertisement, a real QUIC request when
`--require-http3` is set, and a warm entry-asset median under the supplied regional budget. Use a
curl build whose feature list includes `HTTP3` for the strict launch gate. Without the flag, a
runner that lacks QUIC reports the missing proof as a note; it does not pretend `Alt-Svc` proves a
successful HTTP/3 connection.

The 150 ms target is a warm edge/asset budget, not a promise that a cold worldwide page load or an
LLM response completes in 150 ms. Track real-user p75 LCP, INP, and CLS separately, segmented by
device class, connection, route, and geography. Synthetic probes catch release regressions; RUM is
the production truth.

The packaged local CLI server intentionally remains HTTP/1.1 on `127.0.0.1`. Adding TLS, HTTP/2, or
HTTP/3 to loopback would add certificate and CPU overhead without improving a local transfer; the
public CDN is where multiplexing and QUIC matter.
