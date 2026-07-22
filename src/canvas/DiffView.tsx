// A readable unified diff: filename, add/delete counts, and gutter-marked lines.
import type { CSSProperties } from 'react';
import { richInnerHtml } from '../lib/richText';
import { Icon } from '../icons/icons';
import type { DiffViewProps } from '../data/conversation';

type Props = DiffViewProps & { delay?: number };

export function DiffView({ title, file, add, del, lines, footer, delay }: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.edit className="ic" style={{ color: 'var(--presence-soft)' }} />{' '}
        {title || 'The change'}
      </div>
      <div className="diff">
        <div className="diff-head">
          <span className="diff-file mono">
            <Icon.doc style={{ width: 13, height: 13 }} /> {file}
          </span>
          <span className="diff-stat">
            <span className="add">+{add}</span> <span className="del">−{del}</span>
          </span>
        </div>
        <div className="diff-body mono">
          {lines.map((l, i) => (
            <div key={i} className={'diff-line ' + (l.t || 'ctx')}>
              <span className="diff-gutter">{l.t === 'add' ? '+' : l.t === 'del' ? '−' : ''}</span>
              {/* SECURITY: l.c is rendered as raw HTML to allow inline syntax-highlight spans.
                  INVARIANT — for Live blocks this is already neutralized upstream (liveSchema's
                  sanitizeDeep strips tag characters), and authored demo data must never contain
                  raw HTML beyond our own highlight markup. Do not feed user-supplied strings here. */}
              <span className="diff-code" dangerouslySetInnerHTML={richInnerHtml(l.c)} />
            </div>
          ))}
        </div>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
