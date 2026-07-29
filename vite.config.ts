import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { availableParallelism, totalmem } from 'node:os';
// React via Babel + the React Compiler. babel-plugin-react-compiler (run through the
// reactCompilerPreset helper + @rolldown/plugin-babel) auto-memoizes every component and hook at
// build time, so manual memo/useMemo/useCallback are rarely needed and whole-subtree re-renders
// are pruned automatically. `target: '19'` uses React 19's built-in compiler runtime (no extra
// dep). This replaces the SWC plugin: the compiler is Babel-only, and the two React transforms are
// mutually exclusive (Babel HMR is a touch slower than SWC; the runtime memoization is the trade).
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { visualizer } from 'rollup-plugin-visualizer';
import { safePdfUrl } from './src/live/doc/safeUrl';

// /pdf?url=<allowlisted https pdf> — fetch the document server-side and re-serve it from our
// own origin (stripping the source's X-Frame-Options), so an external PDF previews INLINE in
// the pdfreader instead of falling back to a link. The allowlist (safePdfUrl) is the SSRF
// boundary; we also re-validate the FINAL url after redirects so a redirect can't jump to an
// off-allowlist (e.g. internal) host. Dev-only, like the /llm proxies below — a deployed build
// needs an equivalent same-origin forwarder, else pdfreader gracefully shows the "Open" link.
const PDF_MAX_BYTES = 30 * 1024 * 1024;
function pdfProxyPlugin(): Plugin {
  return {
    name: 'mavea-pdf-proxy',
    configureServer(server) {
      server.middlewares.use('/pdf', async (req: IncomingMessage, res: ServerResponse) => {
        const fail = (code: number) => {
          res.statusCode = code;
          res.end();
        };
        try {
          const raw = req.url || '';
          const q = raw.indexOf('?');
          const target = safePdfUrl(
            new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '').get('url') || undefined,
          );
          if (!target) return fail(400);
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 12_000);
          let upstream: Response;
          try {
            upstream = await fetch(target, { signal: ctrl.signal, redirect: 'follow' });
          } finally {
            clearTimeout(timer);
          }
          // A redirect must not escape the allowlist (SSRF guard), and the body must be a PDF.
          if (!safePdfUrl(upstream.url)) return fail(502);
          const ct = upstream.headers.get('content-type') || '';
          if (!upstream.ok || !/pdf/i.test(ct)) return fail(502);
          const declared = Number(upstream.headers.get('content-length') || 0);
          if (declared > PDF_MAX_BYTES) return fail(413);
          const body = Buffer.from(await upstream.arrayBuffer());
          if (body.length > PDF_MAX_BYTES) return fail(413);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline');
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          res.setHeader('X-Frame-Options', 'SAMEORIGIN');
          res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.end(body);
        } catch {
          fail(502);
        }
      });
    },
  };
}

// onnxruntime-web is a transitive dependency of @ricky0123/vad-web, hoisted by pnpm under
// .pnpm/ with no top-level symlink — its on-disk path is version-pinned and a routine dep bump
// silently moves it. Resolve it the way Node actually finds it (starting the search from
// vad-web's own directory, so we get exactly the copy vad-web itself would import) instead of
// hardcoding a version number: resolve the package's main entry (its dist/ORT_ROOT-adjacent
// export map. covers this), then walk up to the package root, which the exports map won't let
// us resolve directly.
function resolveOnnxRuntimeWebRoot(): string {
  const req = createRequire(import.meta.url);
  const vadPkg = req.resolve('@ricky0123/vad-web/package.json');
  const ortMain = req.resolve('onnxruntime-web', { paths: [dirname(vadPkg)] });
  let dir = dirname(ortMain);
  while (dir !== dirname(dir)) {
    if (dir.endsWith('onnxruntime-web') && existsSync(resolve(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('could not locate the onnxruntime-web package root from its resolved entry');
}
const ORT_ROOT = resolveOnnxRuntimeWebRoot();

// VAD/ORT runtime assets that @ricky0123/vad-web and onnxruntime-web fetch from the site ROOT
// (they hardcode '/'). One list, used for BOTH the dev serve and the build copy in the plugin
// below — keep them in sync here.
const VAD_ASSETS: { name: string; src: string }[] = [
  {
    name: 'vad.worklet.bundle.min.js',
    src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
  },
  { name: 'silero_vad_v5.onnx', src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx' },
  // onnxruntime-web ships a JS GLUE module (.mjs) that dynamically imports the .wasm — BOTH are
  // needed. The original setup copied only the .wasm, so ORT's `import('/ort-wasm-simd-threaded.mjs')`
  // 404'd and Silero VAD silently fell back to WebSpeech everywhere.
  { name: 'ort-wasm-simd-threaded.mjs', src: resolve(ORT_ROOT, 'dist/ort-wasm-simd-threaded.mjs') },
  {
    name: 'ort-wasm-simd-threaded.wasm',
    src: resolve(ORT_ROOT, 'dist/ort-wasm-simd-threaded.wasm'),
  },
];

const ASSET_MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript', // ES module glue — must have a JS mime so import() accepts it
  '.wasm': 'application/wasm', // required for WebAssembly streaming compilation
  '.onnx': 'application/octet-stream',
};

// Canonical legal documents live at the repository root so GitHub and npm show the exact same
// terms. Serve those files in development and copy them into dist/legal for the local CLI and any
// static deployment, without maintaining a second public/ copy that can drift.
const LEGAL_DOCS = [
  { source: 'LICENSE', output: 'LICENSE.txt' },
  { source: 'TERMS.md', output: 'TERMS.md' },
  { source: 'DISCLAIMER.md', output: 'DISCLAIMER.md' },
  { source: 'PRIVACY.md', output: 'PRIVACY.md' },
  { source: 'TRADEMARKS.md', output: 'TRADEMARKS.md' },
  { source: 'SUPPORT.md', output: 'SUPPORT.md' },
  { source: 'SECURITY.md', output: 'SECURITY.md' },
  { source: 'THIRD-PARTY.txt', output: 'THIRD-PARTY.txt' },
] as const;

function legalDocsPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'mavea-legal-docs',
    configResolved(c) {
      root = c.root;
    },
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          const pathname = new URL(req.url || '/', 'http://localhost').pathname;
          const doc = LEGAL_DOCS.find(({ output }) => pathname === `/legal/${output}`);
          if (!doc) return next();
          const file = resolve(root, doc.source);
          if (!existsSync(file)) return next();
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(readFileSync(file));
        },
      );
    },
    writeBundle(options) {
      const outDir = options.dir ?? resolve(root, 'dist');
      const legalDir = resolve(outDir, 'legal');
      mkdirSync(legalDir, { recursive: true });
      for (const doc of LEGAL_DOCS) {
        const source = resolve(root, doc.source);
        if (!existsSync(source)) this.error(`Required legal document is missing: ${doc.source}`);
        copyFileSync(source, resolve(legalDir, doc.output));
      }
    },
  };
}

// Make the VAD assets available at '/<name>' in BOTH dev and build. This replaces
// vite-plugin-static-copy, which is broken on Vite 8 two ways: (1) its dev middleware looks up
// Vite internals by name (`viteServePublicMiddleware` etc.) that Vite 8 no longer exposes, so the
// lookup returns -1 and it splices itself AFTER the SPA fallback — every asset then 404s to
// index.html; (2) its build copy preserves the source path, writing to dist/node_modules/… instead
// of the dist root. Either way the files aren't at '/', so Silero VAD silently fell back to
// WebSpeech. This plugin serves them (dev) and copies them flat into the output root (build).
function vadAssetsPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'mavea-vad-assets',
    configResolved(c) {
      root = c.root;
    },
    // DEV: a PRE-hook middleware (registered before Vite's, so before the SPA fallback).
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          const path = (req.url || '').split('?')[0].replace(/^\//, '');
          const asset = VAD_ASSETS.find((a) => a.name === path);
          if (!asset) return next();
          const file = resolve(root, asset.src);
          if (!existsSync(file)) return next();
          res.setHeader(
            'Content-Type',
            ASSET_MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream',
          );
          res.setHeader('Cache-Control', 'no-cache');
          res.end(readFileSync(file));
        },
      );
    },
    // BUILD: copy each asset FLAT into the output root so '/<name>' resolves in production.
    writeBundle(options) {
      const outDir = options.dir ?? resolve(root, 'dist');
      for (const asset of VAD_ASSETS) {
        const from = resolve(root, asset.src);
        if (existsSync(from)) {
          copyFileSync(from, resolve(outDir, asset.name));
        } else {
          // Loud, not silent: the onnxruntime-web@x.y.z path is version-pinned, so a dep bump can
          // move it — surface that at build time instead of shipping a VAD that 404s its model.
          this.warn(`VAD asset not found, omitted from build: ${asset.src}`);
        }
      }
    },
  };
}

// openchemlib's own bundle references `new URL("resources.json", import.meta.url)` inside a
// Node-only resource-loading path (crystallography bond-length tables + MMFF94 force-field data
// for 3-D energy minimization) — Vite/Rolldown statically detects that URL and emits the 1.35MB
// file as a build asset even though nothing in this codebase calls the API that would fetch it
// (we only use Molecule.fromSmiles() + coordinate/bond getters for 2-D depiction, confirmed via
// `grep -rn "registerFromUrl\|Resources.register" src/` returning zero hits). Drop it from the
// output rather than shipping dead weight. Matched by original basename + a size floor (not just
// the hashed output name) so this can't accidentally eat an unrelated future resources.json.
function dropDeadOpenchemlibResourcesPlugin(): Plugin {
  return {
    name: 'mavea-drop-openchemlib-resources',
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type === 'asset' &&
          output.name === 'resources.json' &&
          (typeof output.source === 'string' ? output.source.length : output.source.byteLength) >
            1_000_000
        ) {
          delete bundle[fileName];
          this.warn(`Dropped unused openchemlib resources.json from build: ${fileName}`);
        }
      }
    },
  };
}

// jsPDF's ONLY browser build (dist/jspdf.es.min.js — there is no lighter/core-only export
// condition) bundles its `.html()` convenience plugin inline, which lazily `import("html2canvas")`s
// only when `.html()` is actually called. This codebase never calls it — src/export/pipeline/
// raster.ts renders pages via modern-screenshot and feeds plain images to jsPDF through
// addImage()/output() only (confirmed via `grep -rn "\.html(" src/export/ src/clip/` returning
// zero hits) — but Rollup still treats html2canvas as a reachable async chunk because the dynamic
// import site lives inside jspdf's own module. Drop the resulting chunk (and its sourcemap): real
// package weight for a code path this app structurally cannot reach. If a future export feature
// ever calls jsPDF's `.html()`, tests/jspdf-html-guard.test.ts fails loudly (grep-based) instead of
// this silently producing a 404 dynamic import at runtime.
function dropDeadHtml2canvasChunkPlugin(): Plugin {
  return {
    name: 'mavea-drop-html2canvas-chunk',
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type === 'chunk' &&
          output.moduleIds.some((id) => id.includes('/html2canvas/'))
        ) {
          delete bundle[fileName];
          const mapFile = `${fileName}.map`;
          if (bundle[mapFile]) delete bundle[mapFile];
          this.warn(`Dropped unreachable html2canvas chunk from build: ${fileName}`);
        }
      }
    },
  };
}

// `pnpm dev` is plain `vite` (no --env-file), so read .env here for the one dev-only secret we
// inject server-side: the Gemini key. It lets Ripple's analysis run on a capable model without the
// key ever touching the browser (the /llm/gemini proxy adds it to requests that arrive without one).
function envFromDotenv(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  for (const p of ['.env', '../.env']) {
    try {
      const txt = readFileSync(resolve(process.cwd(), p), 'utf8');
      const m = new RegExp('^' + key + '=(.*)$', 'm').exec(txt);
      if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch {
      /* no .env here — try the next */
    }
  }
  return '';
}
const GEMINI_KEY = envFromDotenv('GEMINI_API_KEY');

/** Worker budget for the test run — the lower of what the CPUs and the RAM can carry. Roughly 3GB
 *  per worker covers a jsdom plus the block library with headroom; see `maxWorkers` below. */
const TEST_WORKERS = Math.max(
  1,
  Math.min(availableParallelism() - 1, Math.floor(totalmem() / 1024 ** 3 / 3)),
);

// Single source of truth for build (Vite) + tests (Vitest).
export default defineConfig({
  // Vite's dep scanner only follows STATIC imports from the entry, so a package that is reached
  // exclusively through a dynamic import() is invisible to it at server start. The first time the
  // running app actually reaches one, Vite pre-bundles it on the spot and hard-reloads the page to
  // swap in the new module graph — which is a blank first paint, and, if you happened to be
  // mid-answer, a turn that dies on the reload (the mic pulling in vad-web was exactly this).
  // Naming them here gets them pre-bundled before the browser ever connects, so there is no
  // mid-session re-optimize and nothing to refresh past. Dev-only: a production build has no
  // discovery step.
  optimizeDeps: {
    include: [
      '@ricky0123/vad-web', // the mic (always-on / barge-in)
      'jspdf', // PDF export
      'katex', // equations
      'leaflet', // the map block
      'mediabunny', // reel encode
      'modern-screenshot', // export rasterisation
      'openchemlib', // molecule blocks (SMILES)
      'pdfjs-dist', // Prism's document explode
      'pptxgenjs', // deck export
      'shiki/core', // code highlighting
      'shiki/engine/javascript',
    ],
  },
  plugins: [
    react(),
    // The React Compiler runs as a filtered Babel pass (the preset only touches React/hook files),
    // so SWC-speed isn't needed for the bulk — Babel handles the JSX + the compiler in one go.
    // Skipped under Vitest: auto-memoization is a runtime-performance transform with no effect on
    // what a component renders, and paying it on every transform made it the single largest cost
    // in the test run (measured: it dominated `transform`, which itself dwarfs actual test time).
    // The shipped bundle is still compiled — `pnpm build`, the browser audits, and the release
    // workflow all exercise the compiled output, so nothing ships untested by it.
    ...(process.env.VITEST ? [] : [babel({ presets: [reactCompilerPreset({ target: '19' })] })]),
    pdfProxyPlugin(),
    vadAssetsPlugin(),
    legalDocsPlugin(),
    dropDeadOpenchemlibResourcesPlugin(),
    dropDeadHtml2canvasChunkPlugin(),
    // `ANALYZE=1 pnpm build` writes a gzip/brotli-weighted treemap to dist/stats.html so chunk
    // bloat is visible at a glance. Off by default — normal and CI builds carry no extra cost.
    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          }) as Plugin,
        ]
      : []),
  ],
  server: {
    port: 5173,
    // NOTE: we intentionally do NOT set COOP/COEP. Cross-origin isolation would let
    // onnxruntime-web (Silero VAD) run multi-threaded via SharedArrayBuffer, but COEP also
    // BLOCKS Chrome's PDF viewer inside the page — so an embedded PDF could never preview, only
    // link out. Inline PDF preview matters more, and ORT runs fine SINGLE-THREADED without SAB
    // (Silero VAD is tiny — frame inference is sub-millisecond), so dropping isolation costs
    // nothing perceptible for voice and unlocks the pdfreader's inline preview.
    // Live-mode proxies. Two kinds, both same-origin so the browser never hits
    // CORS and BYOK keys travel only browser → (local) proxy → provider:
    //   • local voice services (kokoro tts, optional whisper stt)
    //   • hosted LLM providers under /llm/<provider> (key passed in the request
    //     header by the adapter; the proxy just forwards it to the real API)
    proxy: {
      '/tts': {
        target: process.env.KOKORO_URL || 'http://localhost:8880',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tts/, ''),
      },
      '/stt': {
        target: process.env.WHISPER_URL || 'http://localhost:8100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/stt/, ''),
      },
      '/llm/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm\/anthropic/, ''),
        // Strip browser-identifying headers so the proxy looks like a server-side call.
        // Without this, Anthropic rejects the request with:
        // "CORS requests must set 'anthropic-dangerous-direct-browser-access' header"
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      '/llm/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm\/openai/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      '/llm/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm\/gemini/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            // Inject the dev .env key when the client didn't supply one, so features like Ripple can
            // default to Gemini without the user pasting a key (and without the key in the browser).
            if (GEMINI_KEY && !proxyReq.getHeader('x-goog-api-key')) {
              proxyReq.setHeader('x-goog-api-key', GEMINI_KEY);
            }
          });
        },
      },
      '/llm/grok': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm\/grok/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // OpenRouter's API lives under /api/v1, so the adapter calls
      // /llm/openrouter/api/v1/... and we strip only the /llm/openrouter prefix.
      '/llm/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm\/openrouter/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // Keyed web-search providers (BYOK, free tiers available). Browser-origin calls
      // to these are CORS-blocked, so the search adapter sends the user's key in the
      // request header and the proxy forwards it to the real API.
      '/search/brave': {
        target: 'https://api.search.brave.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/search\/brave/, ''),
      },
      '/search/tavily': {
        target: 'https://api.tavily.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/search\/tavily/, ''),
      },
      // Actions gateway — a confirmed action (calendar/Slack/Gmail) posts to /actions/<id>
      // and this forwards to the dependency-free gateway service (gateway/), which holds the
      // credentials and makes the real call. Connection refused (gateway not running) surfaces
      // as an honest "couldn't reach the connector" on the card, never a crash.
      '/actions': {
        target: process.env.ACTIONS_URL || 'http://127.0.0.1:8910',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/actions/, ''),
        // Forward the browser's Origin (the gateway's anti-CSRF check needs it) and, when a
        // shared secret is configured, inject it server-side so the page never sees it.
        configure: (proxy) => {
          const secret = process.env.GATEWAY_SECRET;
          if (!secret) return;
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('x-gateway-secret', secret);
          });
        },
      },
    },
    // NOTE: these /llm/* proxies are DEV-ONLY (Vite dev server). A deployed build
    // serves static files and has no proxy — a production deployment must provide an
    // equivalent same-origin forwarder (e.g. a serverless rewrite) for each /llm/<provider>
    // path, or the BYOK browser calls will hit CORS. The keyless free paths
    // (Wikipedia, Pollinations) need no proxy.
  },
  build: {
    outDir: 'dist',
    // Route budget tooling walks this graph to measure each lazy surface's real static closure.
    manifest: true,
    // Keep the production contract explicit across Vite upgrades. Vite 8's Oxc minifier and
    // Lightning CSS are fast enough for every CI build; the Baseline target covers maintained
    // desktop/mobile browsers without shipping legacy transforms to modern machines.
    target: 'baseline-widely-available',
    minify: 'oxc',
    cssMinify: 'lightningcss',
    cssCodeSplit: true,
    modulePreload: { polyfill: true },
    // Public artifacts never carry original source. If private error-monitoring maps are added in
    // future, upload them in a separate authenticated job and delete them before this build ships.
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    css: false,
    // Only this repo's tests — agent worktrees under .claude/worktrees/ carry full copies
    // of the suite, and the default glob would run them all (slow, and their failures
    // masquerade as ours).
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.claude/**'],
    // The gauntlet suites mount the entire 200+ block vocabulary in one test; on a loaded
    // machine (parallel workers, other builds) they legitimately exceed the 5s default and
    // flake. Real regressions still fail — just with a longer leash.
    testTimeout: 20_000,
    // Vitest sizes its worker pool from CPU count alone, but each worker here is a forked process
    // holding a jsdom, React, and (for the gauntlets) the whole block library — call it ~1GB
    // resident. On a small or old machine, CPU-derived parallelism therefore oversubscribes RAM
    // and the run starts swapping, which is far slower than running fewer workers. Take the lower
    // of the two budgets. On a large machine the RAM term never binds and nothing changes.
    maxWorkers: TEST_WORKERS,
    // Per-test stdout over hundreds of files is a surprising amount of I/O on a CI log stream.
    reporters: process.env.CI ? ['dot'] : ['default'],
  },
});
