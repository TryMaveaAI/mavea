import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { WhatChangedProps } from './types';

type Props = WhatChangedProps & { delay?: number };
type View = 'before' | 'after' | 'diff';

export function WhatChanged({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  beforeLabel = 'Before',
  afterLabel = 'After',
  before,
  after,
  diff,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  // default: diff view — the most informative
  const [view, setView] = useState<View>('diff');

  const adds = diff.filter((l) => l.t === 'add').length;
  const dels = diff.filter((l) => l.t === 'del').length;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-wc-seg">
        <button
          className={'ai-wc-seg-btn' + (view === 'before' ? ' is-on' : '')}
          onClick={() => setView('before')}
        >
          {beforeLabel}
        </button>
        <button
          className={'ai-wc-seg-btn' + (view === 'after' ? ' is-on' : '')}
          onClick={() => setView('after')}
        >
          {afterLabel}
        </button>
        <button
          className={'ai-wc-seg-btn' + (view === 'diff' ? ' is-on' : '')}
          onClick={() => setView('diff')}
        >
          Diff{' '}
          <span className="ai-wc-count">
            <span className="ai-wc-add">+{adds}</span> <span className="ai-wc-del">−{dels}</span>
          </span>
        </button>
      </div>

      {view === 'before' && (
        <div className="ai-wc-prose ai-wc-old" dangerouslySetInnerHTML={richInnerHtml(before)} />
      )}
      {view === 'after' && (
        <div className="ai-wc-prose ai-wc-new" dangerouslySetInnerHTML={richInnerHtml(after)} />
      )}
      {view === 'diff' && (
        <div className="ai-wc-diff">
          {diff.map((l, i) => (
            <div className={'ai-wc-line ' + (l.t || 'ctx')} key={i}>
              <span className="ai-wc-gutter">{l.t === 'add' ? '+' : l.t === 'del' ? '−' : ''}</span>
              <span className="ai-wc-content" dangerouslySetInnerHTML={richInnerHtml(l.c)} />
            </div>
          ))}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
