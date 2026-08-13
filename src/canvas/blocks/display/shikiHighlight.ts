// Shiki, bundled and code-split — the highlighter behind the codeblock. This used to load from
// esm.sh at runtime, but a dynamic CDN import can't carry an integrity hash, which left every
// code render trusting that host's bytes forever. Bundling closes that hole (the same call the
// audit made for katex/pdfjs/maplibre) and works offline; code-splitting keeps it out of every
// bundle until a code block actually renders.
//
// Composition is deliberately fine-grained rather than the kitchen-sink `shiki` bundle:
//   - `core` + the JavaScript regex engine — no oniguruma WASM to fetch, decode, or CSP-allow.
//   - two GitHub themes (the light/dark pair the CSS variables expect).
//   - one lazily-imported grammar chunk per allow-listed language, so a Python answer never
//     downloads the C++ grammar. A grammar registers its own aliases (`shellscript` covers
//     bash/sh/zsh), which is why the map is keyed by canonical id.
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { HighlighterCore } from 'shiki/core';

type LangImport = Parameters<HighlighterCore['loadLanguage']>[0];

const LANG_CHUNKS: Record<string, () => Promise<unknown>> = {
  ts: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  js: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  bash: () => import('shiki/langs/shellscript.mjs'),
  shell: () => import('shiki/langs/shellscript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
};

let corePromise: Promise<HighlighterCore> | null = null;
const langLoads = new Map<string, Promise<void>>();

function core(): Promise<HighlighterCore> {
  corePromise ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return corePromise;
}

/** Highlight `code` as dual-theme HTML, or null for a language we don't ship a grammar for —
 *  the caller falls back to plain text. `txt` is Shiki's built-in plaintext, always available. */
export async function highlightCode(code: string, lang: string): Promise<string | null> {
  const c = await core();
  if (lang !== 'txt') {
    const load = LANG_CHUNKS[lang];
    if (!load) return null;
    let pending = langLoads.get(lang);
    if (!pending) {
      pending = c.loadLanguage(load as LangImport);
      langLoads.set(lang, pending);
    }
    await pending;
  }
  return c.codeToHtml(code, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}
