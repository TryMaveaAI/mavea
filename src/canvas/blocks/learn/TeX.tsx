// LaTeX, rendered to browser-native MathML. KaTeX is used purely as a LaTeX→MathML COMPILER
// (output: 'mathml'), loaded lazily via a dynamic import() so it's code-split into its own chunk
// and never weighs down the eager bundle. The output is native <math>, so it needs no KaTeX
// stylesheet or webfont — those only back its HTML-output path — and inherits the fluid type
// system while staying theme-aware and accessible: exactly like the hand-built MathNode path, but
// the model gets to write LaTeX (which it knows fluently, and which expresses matrices/vectors/
// cases the small AST can't). KaTeX runs with trust:false + throwOnError:false, so its MathML is
// sanitized, controlled markup — never raw model HTML — and invalid input renders a visible error
// rather than throwing. If the import fails (offline / jsdom) we fall back to the raw LaTeX as
// plain, auto-escaped text.
import { useEffect, useState } from 'react';

interface TeXProps {
  /** The LaTeX source, e.g. "\\frac{a}{b}" or "\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}". */
  tex: string;
  /** Block (centered, display) vs inline. */
  display?: boolean;
  /** Accessible label; falls back to a generic one. */
  label?: string;
}

export function TeX({ tex, display, label }: TeXProps) {
  // KaTeX's MathML string, or null until it resolves / when the module can't be loaded.
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    void (async () => {
      try {
        const mod = await import('katex');
        const katex = mod.default ?? mod;
        const out: string = katex.renderToString(tex, {
          displayMode: !!display,
          output: 'mathml',
          throwOnError: false,
          trust: false,
        });
        if (!cancelled) setHtml(out);
      } catch {
        // Offline / jsdom / unexpected error — leave html null so the raw-LaTeX fallback
        // below renders. Never crash, never blank.
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tex, display]);

  if (html === null) {
    return (
      <span className="lr-tex lr-tex-raw" aria-label={label ?? 'mathematical expression'}>
        {tex}
      </span>
    );
  }
  return (
    <span
      className="lr-tex"
      role="img"
      aria-label={label ?? 'mathematical expression'}
      // KaTeX output (trust:false, MathML-only) is controlled, sanitized markup, not raw model
      // input — the documented-safe way to mount KaTeX from React.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
