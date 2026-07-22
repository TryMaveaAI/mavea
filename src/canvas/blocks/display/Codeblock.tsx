// Code, highlighted for real. The model sends raw source (`code`) plus a `lang`, and we run it
// through Shiki client-side — a genuine TextMate-grammar highlighter, not the model's guess at token
// boundaries. Shiki is a bundled dependency, dynamic-imported into its own chunk (shikiHighlight.ts)
// so nothing pays for it until a code block renders; each grammar is a further lazy chunk. Dual
// light/dark themes ride on CSS variables, so the theme switch is pure CSS — no re-highlight, no
// observer. The legacy pre-tokenized `lines` form still renders (older payloads), and if the
// highlighter fails to load we fall back to plain, readable text.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useTimeout } from '../../../hooks/useTimeout';
import { richInnerHtml } from '../../../lib/richText';
import type { CodeblockProps, CodeLine } from './types';
import { isRunnableLang, type SandboxResult } from '../code/sandbox';
import { RunButton } from '../code/RunButton';
import { CodeOutput } from '../code/CodeOutput';

type Props = CodeblockProps & { delay?: number };

// A small, common allowlist. Anything else (or an unknown alias) falls back to plain text, which Shiki
// would otherwise throw on. Kept deliberately short — the long tail isn't worth eager grammar loads.
const SHIKI_LANGS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'html',
  'css',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'sql',
  'bash',
  'shell',
  'yaml',
  'toml',
  'markdown',
  'diff',
]);

// Map a few friendly aliases the model is likely to emit onto Shiki's canonical ids.
const LANG_ALIAS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  py: 'python',
  rb: 'ruby',
  'c++': 'cpp',
  cs: 'csharp',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
};

function normalizeLang(lang: string | undefined): string {
  const l = (lang || '').toLowerCase().trim();
  const canonical = LANG_ALIAS[l] ?? l;
  return SHIKI_LANGS.has(canonical) ? canonical : 'txt';
}

function lineToText(line: CodeLine) {
  return line.map((t) => t.text).join('');
}

export function Codeblock({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  lang = 'tsx',
  filename,
  code,
  lines,
  lineNumbers = true,
  highlight = [],
  runnable = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const [copied, setCopied] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);
  // Shiki's rendered HTML, or null until it resolves / when we have no raw `code`.
  const [shikiHtml, setShikiHtml] = useState<string | null>(null);
  const hi = new Set(highlight);
  // Reset the "copied" affordance after a beat — self-cancels on unmount.
  useTimeout(() => setCopied(false), copied ? 1600 : null);

  const hasCode = typeof code === 'string' && code.length > 0;
  const safeLang = normalizeLang(lang);

  // Highlight raw `code` with the bundled Shiki chunk. Re-runs when the code or language changes;
  // the `cancelled` guard makes the async write safe across unmount/re-entry (no listener to tear
  // down).
  useEffect(() => {
    if (!hasCode) {
      setShikiHtml(null);
      return;
    }
    let cancelled = false;
    setShikiHtml(null);
    void (async () => {
      try {
        const { highlightCode } = await import('./shikiHighlight');
        const html = await highlightCode(code, safeLang);
        if (!cancelled) setShikiHtml(html);
      } catch {
        // Chunk failed to load / unexpected grammar error — leave shikiHtml null so we render
        // the plain-text fallback below. Never crash, never blank.
        if (!cancelled) setShikiHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasCode, code, safeLang]);

  const copy = () => {
    const text = hasCode ? code! : (lines ?? []).map(lineToText).join('\n');
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard may be blocked in sandbox — still show the copied affordance */
    }
    setCopied(true);
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cb-frame">
        <div className="cb-chrome">
          <span className="cb-dots" aria-hidden>
            <i /> <i /> <i />
          </span>
          {filename && <span className="cb-file mono">{filename}</span>}
          <span className="cb-lang">{lang}</span>
          <button type="button" className={`cb-copy ${copied ? 'done' : ''}`} onClick={copy}>
            {copied ? <Icon.check /> : <Icon.proof />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {hasCode ? (
          shikiHtml ? (
            // Shiki's own escaped, highlighted markup — derived from the raw string by a trusted
            // grammar, never raw model HTML. Line numbers come from a CSS counter on `.cb-shiki`.
            <div
              className={`cb-shiki ${lineNumbers ? 'cb-nums' : ''}`}
              dangerouslySetInnerHTML={{ __html: shikiHtml }}
            />
          ) : (
            // Pre-highlight (loading) or highlighter-unavailable fallback: plain, readable,
            // auto-escaped text.
            <pre className="cb-pre mono cb-plain">
              <code>{code}</code>
            </pre>
          )
        ) : (
          // Legacy pre-tokenized form — render the colored token spans as before.
          <pre className="cb-pre mono">
            <code>
              {(lines ?? []).map((line, i) => (
                <span key={i} className={`cb-line ${hi.has(i + 1) ? 'hl' : ''}`}>
                  {lineNumbers && <span className="cb-ln">{i + 1}</span>}
                  <span className="cb-code">
                    {line.length === 0
                      ? ' '
                      : line.map((tok, j) => (
                          <span key={j} className={`tok tok-${tok.kind || 'punct'}`}>
                            {tok.text}
                          </span>
                        ))}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        )}
      </div>

      {runnable && isRunnableLang(safeLang) && (
        <RunButton
          code={hasCode ? code! : (lines ?? []).map(lineToText).join('\n')}
          lang={safeLang}
          onResult={setSandboxResult}
        />
      )}
      {sandboxResult && (
        <CodeOutput result={sandboxResult} onDismiss={() => setSandboxResult(null)} />
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
