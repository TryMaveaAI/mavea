// Permission-gated action card: idle → editing (optional) → running → done | error.
// Safety copy is auto-derived from the mcpId so demos can't accidentally say "sends now."
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { ActionProps } from '../data/conversation';

type Phase = 'idle' | 'editing' | 'running' | 'done' | 'error';
type Props = ActionProps & { delay?: number; onConfirm?: () => void };

function safetyPerm(mcpId?: string, override?: string): string {
  if (override) return override;
  if (!mcpId)
    return 'Mavéa needs your OK before it does anything. Nothing happens until you confirm.';
  if (mcpId.startsWith('calendar.')) return 'Adds one event to your calendar. No invites are sent.';
  if (mcpId.startsWith('github.'))
    return "Opens a draft PR. It won't merge until you review and approve it on GitHub.";
  return 'Mavéa needs your OK before it does anything. Nothing happens until you confirm.';
}

export function ActionCard({
  delay,
  onConfirm,
  eyebrow = 'Action',
  icon = 'mail',
  title = 'Run this action',
  lines,
  perm,
  cta = 'Confirm',
  doneText = 'Done',
  mcpId,
  fields,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldVals, setFieldVals] = useState<Record<string, string>>(() =>
    Object.fromEntries((fields ?? []).map((f) => [f.param, f.value])),
  );
  const [errorMsg, setErrorMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const Ic = Icon[icon as keyof typeof Icon] || Icon.mail;
  const permText = safetyPerm(mcpId, perm);

  const run = async () => {
    setPhase('running');
    // The scripted demo never performs real side-effects: a fictional persona's action is
    // SIMULATED, never POSTed to the actions gateway. Posting 502'd when no gateway was running
    // (the cause of the reported error) and would create a real calendar event / draft PR if one
    // were configured — wrong for a demo. Live actions go through ActionProposal, not this card.
    // Show a brief "Working…", then the done state. mcpId still drives the safety copy.
    await new Promise<void>((r) => {
      timer.current = setTimeout(r, 1400);
    });
    setPhase('done');
    onConfirm?.();
  };

  const startEditing = () => setPhase('editing');
  const cancelEdit = () => setPhase('idle');
  const confirmEdit = () => run();

  return (
    <div
      className="card action-card reveal"
      style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: 'var(--presence-soft)' }} /> {eyebrow}
      </div>
      <div className="insight-title" style={{ fontSize: 17 }}>
        {title}
      </div>

      {phase !== 'editing' && lines && lines.length > 0 && (
        <div className="action-preview">
          {lines.map((l, i) => (
            <div key={i} style={{ marginTop: i ? 6 : 0 }}>
              <span className="to">{l.k}</span> · {l.v}
            </div>
          ))}
        </div>
      )}

      {phase === 'editing' && fields && fields.length > 0 && (
        <div className="action-edit-fields">
          {fields.map((f) => (
            <div key={f.param} className="action-edit-field">
              <label className="action-edit-label">{f.label}</label>
              {f.multiline ? (
                <textarea
                  className="action-edit-input action-edit-textarea"
                  value={fieldVals[f.param] ?? ''}
                  onChange={(e) => setFieldVals((v) => ({ ...v, [f.param]: e.target.value }))}
                  rows={4}
                />
              ) : (
                <input
                  className="action-edit-input"
                  type="text"
                  value={fieldVals[f.param] ?? ''}
                  onChange={(e) => setFieldVals((v) => ({ ...v, [f.param]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {phase !== 'editing' && (
        <div className="perm">
          <Icon.lock /> {permText}
        </div>
      )}

      {phase === 'done' && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={!onConfirm}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--insight)',
            fontWeight: 600,
            fontSize: 14,
            marginTop: 6,
            background: 'none',
            border: 0,
            padding: 0,
            textAlign: 'left',
            cursor: onConfirm ? 'pointer' : 'default',
          }}
        >
          <Icon.check style={{ width: 18, height: 18 }} /> {doneText}
          {onConfirm && <span className="open-app-hint">· open ↗</span>}
        </button>
      )}

      {phase === 'error' && (
        <div className="action-error">
          <span className="action-error-msg">{errorMsg}</span>
          <button
            className="btn-ghost"
            style={{ marginLeft: 12 }}
            onClick={() => {
              setPhase('idle');
              setErrorMsg('');
            }}
          >
            Retry
          </button>
        </div>
      )}

      {phase === 'idle' && (
        <div className="action-btns">
          <button className="btn-primary" onClick={run}>
            <Icon.check style={{ width: 16, height: 16 }} /> {cta}
          </button>
          {fields && fields.length > 0 && (
            <button className="btn-ghost" onClick={startEditing}>
              Edit first
            </button>
          )}
        </div>
      )}

      {phase === 'editing' && (
        <div className="action-btns">
          <button className="btn-primary" onClick={confirmEdit}>
            <Icon.check style={{ width: 16, height: 16 }} /> Confirm
          </button>
          <button className="btn-ghost" onClick={cancelEdit}>
            Cancel
          </button>
        </div>
      )}

      {phase === 'running' && (
        <div className="action-btns">
          <button className="btn-primary" disabled>
            <span className="tiny-spin"></span> Working…
          </button>
        </div>
      )}
    </div>
  );
}
