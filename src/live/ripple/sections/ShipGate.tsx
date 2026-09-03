// ShipGate.tsx — the humans + agents gate. One artifact, read two ways: a picture a person can act
// on (a verdict, the conditions that clear it, who owns each), and a machine-readable contract an
// agent can enforce (the mavea.gate(pr) block — the same shipSafe / unackedP0 / requires / deployOrder
// an automated check would gate on). Ripple is strictly READ-ONLY: it reads your code and shows the
// consequence — it never posts, comments, approves, or merges. You can copy its read to act on it.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { GateCondition } from '../model';
import type { SectionProps } from './types';
import './shipgate.css';

/** The verdict header copy + token, keyed off the gate decision (concept 08 §6). */
const DECISION = {
  block: { label: 'Blocked', token: 'var(--danger)' },
  watch: { label: 'Watch', token: 'var(--warning)' },
  pass: { label: 'Safe to ship', token: 'var(--insight)' },
} as const;

/** A merge condition's pill: met → insight, pending → muted, failed → danger. */
function conditionToken(status: GateCondition['status']): string {
  return status === 'met'
    ? 'var(--insight)'
    : status === 'failed'
      ? 'var(--danger)'
      : 'var(--text-muted)';
}

function conditionLabel(status: GateCondition['status']): string {
  return status === 'met' ? 'MET' : status === 'failed' ? 'FAILED' : 'PENDING';
}

/** Plain-language owner tag — the human reads "you", the agent's structured check reads "agent". */
function actorLabel(actor: GateCondition['actor']): string {
  return actor === 'human' ? 'you' : 'agent';
}

/** One syntax-colored line of the machine contract: keys muted, booleans danger/insight, the
 *  requires array tinted insight. Tokens — never raw color — so light/dark tracks automatically. */
interface GateLine {
  key: string;
  value: string;
  /** Color for the value half; the key is always muted. */
  valueColor: string;
}

export function ShipGate({ model }: SectionProps): ReactElement {
  const { gate, pr } = model;
  const verdict = DECISION[gate.decision];
  const prLabel = pr.number ?? 'pr';

  // Copy Ripple's read to the clipboard — a purely local action, so the strict read-only rule holds
  // (Ripple itself never writes anywhere). You paste it wherever you'd act.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const copyRead = useCallback(() => {
    const text = [
      `${pr.repo || 'change'} ${pr.number ?? ''} — ${verdict.label}`.trim(),
      gate.rationale,
      '',
      ...gate.conditions.map(
        (c) => `[${conditionLabel(c.status)}] ${c.label} (${actorLabel(c.actor)})`,
      ),
      gate.requires.length ? `\nRequires: ${gate.requires.join(', ')}` : '',
    ].join('\n');
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
      },
      () => undefined,
    );
  }, [gate, pr, verdict]);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  // The agent-facing contract, computed straight from the grounded gate — the same fields an
  // automated check would read. Built once; it only changes when the model does.
  const contract = useMemo<GateLine[]>(
    () => [
      {
        key: 'ship_safe',
        value: String(gate.shipSafe),
        valueColor: gate.shipSafe ? 'var(--insight)' : 'var(--danger)',
      },
      {
        key: 'unacked_p0',
        value: String(gate.unackedP0),
        valueColor: gate.unackedP0 > 0 ? 'var(--danger)' : 'var(--insight)',
      },
      {
        key: 'requires',
        value: `[${gate.requires.map((r) => `"${r}"`).join(', ')}]`,
        valueColor: 'var(--insight)',
      },
      {
        key: 'deploy_order',
        value: `"${gate.deployOrder}"`,
        valueColor: 'var(--text-secondary)',
      },
    ],
    [gate.shipSafe, gate.unackedP0, gate.requires, gate.deployOrder],
  );

  // The terminal's status echoes the verdict two rows up. Reading it off `shipSafe` alone printed
  // "blocked" over a Watch verdict, since anything that isn't purely tests/config is not ship-safe.
  const contractStatus = gate.decision === 'pass' ? 'clear' : verdict.label.toLowerCase();

  return (
    <div className="ripple-gate">
      {/* ── the verdict ── */}
      <header
        className="ripple-gate-verdict"
        style={{ ['--gate-accent' as string]: verdict.token }}
      >
        <span className="ripple-gate-badge">{verdict.label}</span>
        <div className="ripple-gate-verdict-text">
          <p className="ripple-gate-summary">
            <strong>{gate.unackedP0}</strong> un-acknowledged P0 path
            {gate.unackedP0 === 1 ? '' : 's'}
          </p>
          <p className="ripple-gate-rationale">{gate.rationale}</p>
        </div>
      </header>

      {/* ── what must clear first ── */}
      <section className="ripple-gate-conditions" aria-label="Merge conditions">
        <div className="ripple-eyebrow">Merge conditions</div>
        <ul className="ripple-gate-cond-list">
          {gate.conditions.map((c) => (
            <li
              className="ripple-gate-cond"
              key={c.id}
              style={{ ['--cond-accent' as string]: conditionToken(c.status) }}
            >
              <span className="ripple-gate-cond-pill">{conditionLabel(c.status)}</span>
              <span className="ripple-gate-cond-label">{c.label}</span>
              <span
                className="ripple-gate-cond-actor"
                data-actor={c.actor}
                title={
                  c.actor === 'human' ? 'A human must clear this' : "An agent's check clears this"
                }
              >
                {actorLabel(c.actor)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── requires + deploy order ── */}
      {/* Nothing derives prerequisites from a diff — cross-repo contracts need a connected graph —
          so an empty `requires` means "not established", not "none". Saying "No external
          prerequisites" there was a safety claim made from having looked at nothing; the row
          appears only when there is something to show. */}
      {(gate.requires.length > 0 || gate.deployOrder === 'enforced') && (
        <section className="ripple-gate-requires" aria-label="Requires">
          <div className="ripple-eyebrow">Requires</div>
          <div className="ripple-gate-req-row">
            {gate.requires.map((r) => (
              <code className="ripple-gate-chip" key={r}>
                {r}
              </code>
            ))}
            {gate.deployOrder === 'enforced' && (
              <span className="ripple-gate-deploy">
                deploy order: <strong data-enforced>enforced</strong>
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── the machine-readable contract: what an agent gates on ── */}
      <section className="ripple-gate-agents" aria-label="For your agents">
        <div className="ripple-eyebrow">For your agents</div>
        <div className="ripple-gate-terminal">
          <div className="ripple-gate-term-head">
            <span className="ripple-gate-term-prompt">
              mavea.gate(<span className="ripple-gate-term-arg">{prLabel}</span>)
            </span>
            <span
              className="ripple-gate-term-status"
              style={{ ['--gate-accent' as string]: verdict.token }}
            >
              {contractStatus}
            </span>
          </div>
          <pre className="ripple-gate-term-body">
            <span className="ripple-gate-term-brace">{'{'}</span>
            {contract.map((line, i) => (
              <span className="ripple-gate-term-line" key={line.key}>
                {'  '}
                <span className="ripple-gate-term-key">{line.key}</span>
                <span className="ripple-gate-term-punct">: </span>
                <span style={{ color: line.valueColor }}>{line.value}</span>
                {i < contract.length - 1 && <span className="ripple-gate-term-punct">,</span>}
              </span>
            ))}
            <span className="ripple-gate-term-brace">{'}'}</span>
          </pre>
        </div>
      </section>

      {/* ── strictly read-only: Ripple analyzes; you take any action yourself ── */}
      <section className="ripple-gate-review" aria-label="Read-only">
        <div className="ripple-gate-review-head">
          <div className="ripple-eyebrow">Read-only</div>
          <div className="ripple-gate-review-actions">
            <button
              type="button"
              className="ripple-gate-rev-btn"
              data-kind="copy"
              onClick={copyRead}
            >
              {copied ? 'Copied ✓' : 'Copy this read'}
            </button>
          </div>
        </div>
        <p className="ripple-gate-review-note">
          Ripple is read-only — it never posts, comments, approves, or merges. It reads your code
          and shows the consequence; any action is yours to take.
        </p>
      </section>
    </div>
  );
}
