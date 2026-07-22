import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TerminalProps, TerminalLine } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TerminalProps & { delay?: number };

// A faithful shell-session card: a titled window with traffic-light chrome, then the
// transcript — command lines carry the prompt and a brightened first word, stdout is calm,
// stderr is danger-tinted, and inline comments are muted. A final exit-code badge reads
// green on 0 / red otherwise. Pure render of authored/model lines: nothing is executed.
export function Terminal({
  title,
  icon = 'chevR',
  iconColor = 'var(--presence)',
  prompt = '$',
  lines,
  exitCode,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chevR;
  const rows = lines ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div
        className="term"
        role="img"
        aria-label={title ? `Terminal: ${title}` : 'Terminal session'}
      >
        <div className="term-bar" aria-hidden="true">
          <span className="term-dot term-dot-a" />
          <span className="term-dot term-dot-b" />
          <span className="term-dot term-dot-c" />
          <span className="term-bar-label">{prompt}</span>
        </div>
        <div className="term-body">
          {rows.map((line, i) => (
            <TermRow key={i} line={line} prompt={prompt} />
          ))}
          {exitCode != null && (
            <div className={`term-exit${exitCode === 0 ? ' ok' : ' err'}`}>
              exit {exitCode}
              {exitCode === 0 ? ' · ok' : ' · failed'}
            </div>
          )}
        </div>
      </div>

      {caption && <div className="term-caption">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

function TermRow({ line, prompt }: { line: TerminalLine; prompt: string }) {
  const kind = line.kind ?? 'stdout';
  if (kind === 'command') {
    // Brighten the program name (first token) so the eye lands on what ran.
    const text = line.text ?? '';
    const sp = text.indexOf(' ');
    const head = sp === -1 ? text : text.slice(0, sp);
    const rest = sp === -1 ? '' : text.slice(sp);
    return (
      <div className="term-line term-cmd">
        <span className="term-prompt">{line.prompt ?? prompt}</span>
        <span className="term-cmd-text">
          <span className="term-cmd-head">{head}</span>
          {rest}
        </span>
      </div>
    );
  }
  if (kind === 'comment') {
    return <div className="term-line term-comment"># {line.text}</div>;
  }
  return <div className={`term-line term-${kind === 'stderr' ? 'err' : 'out'}`}>{line.text}</div>;
}
