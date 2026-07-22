import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RedlineProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RedlineProps & { delay?: number };

type Mode = 'review' | 'final' | 'original';

export function Redline({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  docName,
  tokens,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  // default = show tracked changes (the most informative revealed state)
  const [mode, setMode] = useState<Mode>('review');

  const ins = tokens.filter((t) => t.ins != null).length;
  const del = tokens.filter((t) => t.del != null).length;
  const edits = ins + del;

  const tabs: { id: Mode; label: string; icon: keyof typeof Icon }[] = [
    { id: 'review', label: 'Tracked', icon: 'eye' },
    { id: 'final', label: 'Final', icon: 'check' },
    { id: 'original', label: 'Original', icon: 'undo' },
  ];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="rl-head">
        {docName && <span className="rl-docname mono faint">{docName}</span>}
        <span className="rl-count tab-num">
          <span className="rl-pip ins" />
          {ins} <span className="rl-pip del" />
          {del}
        </span>
      </div>

      <div className="rl-tabs">
        {tabs.map((t) => {
          const Ti = Icon[t.icon];
          return (
            <button
              key={t.id}
              className={`rl-tab ${mode === t.id ? 'on' : ''}`}
              onClick={() => setMode(t.id)}
            >
              <Ti className="ic" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className={`rl-doc mode-${mode}`}>
        {tokens.map((t, i) => {
          if (t.text != null)
            return (
              <span key={i} className="rl-keep">
                {t.text}
              </span>
            );
          if (t.ins != null) {
            if (mode === 'original') return null;
            return (
              <span key={i} className="rl-ins" title={t.by ? `inserted by ${t.by}` : 'insertion'}>
                {t.ins}
              </span>
            );
          }
          if (t.del != null) {
            if (mode === 'final') return null;
            return (
              <span key={i} className="rl-del" title={t.by ? `deleted by ${t.by}` : 'deletion'}>
                {t.del}
              </span>
            );
          }
          return null;
        })}
      </div>

      <div className="rl-foot">
        {mode === 'review' && (
          <span className="rl-hint faint">
            {edits} tracked change{edits === 1 ? '' : 's'} — switch views to accept or reject
          </span>
        )}
        {mode === 'final' && (
          <span className="rl-hint" style={{ color: 'var(--insight)' }}>
            Accepted — showing final copy
          </span>
        )}
        {mode === 'original' && (
          <span className="rl-hint" style={{ color: 'var(--text-muted)' }}>
            Rejected — showing original copy
          </span>
        )}
      </div>

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
