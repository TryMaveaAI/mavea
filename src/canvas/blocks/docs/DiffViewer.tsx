import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DiffViewerProps, DiffLine } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DiffViewerProps & { delay?: number };

const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '−', ctx: ' ' };

export function DiffViewer({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  leftLabel = 'before',
  rightLabel = 'after',
  lines,
  split = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const adds = lines.filter((l) => l.kind === 'add').length;
  const dels = lines.filter((l) => l.kind === 'del').length;

  // Split view pairs del/add lines into two columns; unified stacks them in one.
  const renderUnified = () => (
    <div className="dc-diff-body" role="table">
      {lines.map((l, i) => (
        <div key={i} className={'dc-diff-line ' + l.kind} role="row">
          <span className="dc-diff-gut">{l.oldNo ?? ''}</span>
          <span className="dc-diff-gut">{l.newNo ?? ''}</span>
          <span className="dc-diff-sign">{SIGN[l.kind]}</span>
          <span className="dc-diff-code">{l.text}</span>
        </div>
      ))}
    </div>
  );

  const renderSplit = () => (
    <div className="dc-diff-split">
      <div className="dc-diff-body">
        {lines
          .filter((l) => l.kind !== 'add')
          .map((l, i) => (
            <div key={i} className={'dc-diff-line ' + (l.kind === 'del' ? 'del' : 'ctx')}>
              <span className="dc-diff-gut">{l.oldNo ?? ''}</span>
              <span className="dc-diff-code">{l.text}</span>
            </div>
          ))}
      </div>
      <div className="dc-diff-body">
        {lines
          .filter((l) => l.kind !== 'del')
          .map((l, i) => (
            <div key={i} className={'dc-diff-line ' + (l.kind === 'add' ? 'add' : 'ctx')}>
              <span className="dc-diff-gut">{l.newNo ?? ''}</span>
              <span className="dc-diff-code">{l.text}</span>
            </div>
          ))}
      </div>
    </div>
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="dc-diff-head">
        <span className="dc-diff-files">
          {leftLabel} <Icon.chevR className="dc-diff-arrow" /> {rightLabel}
        </span>
        <span className="dc-diff-stat">
          {/* additions count is the extreme figure — more lines added than removed is the dominant signal */}
          <span className="add" data-mark="underline">
            +{adds}
          </span>{' '}
          <span className="del">−{dels}</span>
        </span>
      </div>
      <div className="dc-diff">{split ? renderSplit() : renderUnified()}</div>
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
