import { useState, useCallback, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SyntaxBreakdownProps, SyntaxToken } from './types';
import { isRunnableLang, type SandboxResult } from './sandbox';
import { RunButton } from './RunButton';
import { CodeOutput } from './CodeOutput';
import { richInnerHtml } from '../../../lib/richText';

type Props = SyntaxBreakdownProps & { delay?: number };

// Maps token kind to a design-system color variable.
// Keywords (control flow, declarations) get --insight; string/value literals get
// --presence; operators and identifiers fall back to the primary text color so
// they don't compete for attention; comments use the muted track.
function tokenColor(kind: SyntaxToken['kind']): string {
  switch (kind) {
    case 'keyword':
    case 'type':
      return 'var(--insight)';
    case 'value':
      return 'var(--presence)';
    case 'comment':
      return 'var(--text-muted)';
    default:
      return 'var(--text-primary)';
  }
}

// Inline token-level highlights rendered inside the code column.
// Each chip shows the token in its semantic color plus a muted label so
// readers can match code → concept without leaving the row.
function TokenChips({ tokens }: { tokens: SyntaxToken[] }) {
  return (
    <div className="sb-tokens">
      {tokens.map((tok, i) => (
        <span key={i} className="sb-token">
          <span className="sb-token-code" style={{ color: tokenColor(tok.kind) }}>
            {tok.code}
          </span>
          <span className="sb-token-label">{tok.label}</span>
        </span>
      ))}
    </div>
  );
}

// Annotated code breakdown: each line is rendered as a two-column row —
// left: syntax-highlighted code snippet; right: plain-language explanation.
// Alternating row backgrounds add rhythm without a heavy grid, letting readers
// scan either column independently. Token chips below the code line are shown
// when the data agent supplies per-token labels (i.e. for learning walkthroughs).
export function SyntaxBreakdown({
  title,
  icon = 'doc',
  iconColor,
  lang,
  lines,
  summary,
  runnable = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const accentColor = iconColor ?? 'var(--insight)';
  const lineList = lines ?? [];

  // Assemble the full runnable snippet from all lines and check if it can be executed.
  const normalizedLang = (lang ?? '').toLowerCase();
  const canRun = runnable && isRunnableLang(normalizedLang);
  const fullCode = lineList.map((l) => l.code).join('\n');

  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);
  const dismissResult = useCallback(() => setSandboxResult(null), []);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: accentColor }} />
        {title}
        {lang && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 'var(--fs-xs, 11px)',
              color: 'var(--text-muted)',
              textTransform: 'lowercase',
              letterSpacing: '0.03em',
            }}
          >
            {lang}
          </span>
        )}
      </div>

      {summary && <p className="sb-summary">{summary}</p>}

      <div className="sb-lines">
        {lineList.map((line, i) => {
          // Alternating rows: even rows get the elevated surface, odd rows are
          // transparent so the base card background shows through. This creates
          // a subtle zebra stripe that survives both light and dark themes.
          const rowStyle: CSSProperties =
            i % 2 === 0
              ? { background: 'var(--surface-elevated)', borderRadius: 'var(--r-sm)' }
              : {};

          return (
            <div key={i} className="sb-line-row" style={rowStyle}>
              {/* Left column: code snippet + optional per-token chips */}
              <div className="sb-code-col">
                <div className="sb-code">{line.code}</div>
                {line.tokens && line.tokens.length > 0 && <TokenChips tokens={line.tokens} />}
              </div>

              {/* Right column: line-level prose explanation */}
              {line.explanation && (
                <div
                  className="sb-exp"
                  style={{
                    flex: '1.2',
                    minWidth: 0,
                    paddingTop: 4,
                  }}
                >
                  {line.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}

      {canRun && (
        <div style={{ marginTop: 10 }}>
          <RunButton code={fullCode} lang={normalizedLang} onResult={setSandboxResult} />
          {sandboxResult && <CodeOutput result={sandboxResult} onDismiss={dismissResult} />}
        </div>
      )}
    </div>
  );
}
