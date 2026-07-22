// ActionProposal.tsx — the confirm card for a model-PROPOSED action.
//
// When an answer leads to a concrete next step, the model may emit an `action` block;
// this renders it as a card that shows exactly what will happen (the tool + its args) and
// a single confirm button. Nothing fires until the user clicks: on confirm it calls
// runAction (which posts to the `/actions` proxy → MCP router) and shows the result. An
// unknown action id renders nothing — safe by construction, and the BlockBoundary covers
// the rest.
import { useState } from 'react';
import { actionSpec, runAction } from '../live/actions';

export interface ActionProposalProps {
  id: string;
  label?: string;
  args?: Record<string, unknown>;
  delay?: number;
}

type Phase = 'idle' | 'running' | 'done' | 'error';

export function ActionProposal({ id, label, args = {}, delay = 0 }: ActionProposalProps) {
  const spec = actionSpec(id);
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState('');
  if (!spec) return null;

  const strArgs: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    strArgs[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }

  const confirm = async () => {
    setPhase('running');
    const r = await runAction(id, strArgs);
    setDetail(r.detail);
    setPhase(r.ok ? 'done' : 'error');
  };

  return (
    <div className="card reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="card-eyebrow">{spec.label}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{label || spec.desc}</div>
      <dl style={{ margin: '0 0 12px', display: 'grid', gap: 4 }}>
        {spec.params.map((p) => {
          const v = strArgs[p.name];
          if (!v) return null;
          return (
            <div key={p.name} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <dt className="faint" style={{ minWidth: 84 }}>
                {p.name}
              </dt>
              <dd style={{ margin: 0 }}>{v}</dd>
            </div>
          );
        })}
      </dl>
      {phase === 'done' ? (
        <div style={{ fontSize: 13, color: 'var(--insight)' }}>✓ {detail}</div>
      ) : phase === 'error' ? (
        <div style={{ fontSize: 13, color: 'var(--warning)' }}>{detail}</div>
      ) : (
        <button
          className="entry-action"
          onClick={confirm}
          disabled={phase === 'running'}
          style={{ fontSize: 13 }}
        >
          {phase === 'running' ? 'Working…' : spec.cta}
        </button>
      )}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
        Review before confirming. You are responsible for recipients, account changes, irreversible
        effects, provider terms, charges, and other consequences.
      </div>
    </div>
  );
}
