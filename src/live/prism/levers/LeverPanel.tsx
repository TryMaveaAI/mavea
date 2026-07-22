// levers/LeverPanel.tsx — the Live Levers dock: drag an assumption, watch the conclusion recompute and
// flip red. The inputs are sliders (each grounded to a page); the derived values recompute LIVE in pure
// code on every drag (no model, no network), and a conclusion with a stated bound turns red the moment
// the bound is violated. Click any row to fly to its figure on the real page. Silent, text-first.
import type { ReactElement } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { evaluate, boundSatisfied } from './dag';
import type { LeverModel, LeverNode, LeverUnit } from './types';
import './levers.css';

export interface LeverPanelProps {
  /** The gated lever model, or null while extracting / when the document has no model that checks out. */
  model: LeverModel | null;
  busy: boolean;
  /** Fly to a node's figure on its real page. */
  onFocusNode: (node: LeverNode) => void;
  onClose: () => void;
}

function fmtCurrency(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${+(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${+(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${+(a / 1e3).toFixed(1)}k`;
  return `${s}$${Math.round(a)}`;
}
function fmtCount(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${+(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${+(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${+(a / 1e3).toFixed(1)}k`;
  return `${s}${Math.round(a)}`;
}
function fmtValue(v: number, unit: LeverUnit): string {
  if (!Number.isFinite(v)) return '—';
  if (unit === '%') return `${+v.toFixed(1)}%`;
  if (unit === 'x') return `${+v.toFixed(2)}×`;
  if (unit === 'currency') return fmtCurrency(v);
  if (unit === 'count') return fmtCount(v);
  return `${+v.toFixed(2)}`;
}

export function LeverPanel({ model, busy, onFocusNode, onClose }: LeverPanelProps): ReactElement {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  const result = useMemo(
    () =>
      model
        ? evaluate(model.nodes, new Map(Object.entries(overrides)))
        : { values: new Map<string, number>(), unresolved: new Set<string>() },
    [model, overrides],
  );

  const byId = useMemo(() => new Map((model?.nodes ?? []).map((n) => [n.id, n])), [model]);
  const inputs = (model?.inputs ?? []).map((id) => byId.get(id)).filter((n): n is LeverNode => !!n);
  const derived = (model?.nodes ?? []).filter((n) => n.formula);
  const changed = Object.keys(overrides).length > 0;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- containment only (see `stop` above), not a click affordance
    <section
      className="prism-lv"
      aria-label="Live levers"
      onPointerDown={stop}
      onWheel={stop}
      onClick={stop}
    >
      <header className="prism-lv-head">
        <span className="prism-lv-title">
          <span className="prism-lv-spark" aria-hidden="true" />
          Live levers
        </span>
        <div className="prism-lv-head-right">
          {model && changed && (
            <button type="button" className="prism-lv-reset" onClick={() => setOverrides({})}>
              Reset
            </button>
          )}
          <button
            type="button"
            className="prism-lv-min"
            onClick={onClose}
            aria-label="Hide live levers"
          >
            ▾
          </button>
        </div>
      </header>

      {busy && (
        <p className="prism-lv-empty">
          <span className="prism-lv-dot" aria-hidden="true" />
          Extracting the model implied under the document…
        </p>
      )}
      {!busy && !model && (
        <p className="prism-lv-empty">
          No quantitative model to drive — the document’s figures don’t form a model whose
          arithmetic checks out against itself.
        </p>
      )}
      {!busy && model && (
        <>
          <p className="prism-lv-intro">
            Drag an assumption — every figure traces to a page; the conclusion recomputes live.
          </p>

          <div className="prism-lv-body">
            <p className="prism-lv-group">Assumptions</p>
            {inputs.map((n) => {
              const value = overrides[n.id] ?? n.printed;
              const min = n.min ?? 0;
              // `?? (… || 100)` not `(…) || 100`: a legitimate max of 0 (a negative-printed input,
              // whose range is [printed*2, 0]) must survive, not collapse to 100.
              const max = n.max ?? (n.printed * 2 || 100);
              const step = (max - min) / 200 || 1;
              return (
                <div key={n.id} className="prism-lv-input">
                  <div className="prism-lv-input-head">
                    <button
                      type="button"
                      className="prism-lv-label"
                      onClick={() => onFocusNode(n)}
                      title={n.quote}
                    >
                      {n.label}
                    </button>
                    <span className={'prism-lv-val' + (value !== n.printed ? ' is-changed' : '')}>
                      {fmtValue(value, n.unit)}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="prism-lv-slider"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [n.id]: Number(e.target.value) }))
                    }
                    aria-label={`${n.label} (drag to change)`}
                  />
                </div>
              );
            })}

            <p className="prism-lv-group">Conclusions</p>
            {derived.map((n) => {
              const v = result.values.get(n.id);
              const ok = v === undefined ? null : n.bound ? boundSatisfied(n.bound, v) : null;
              return (
                <button
                  type="button"
                  key={n.id}
                  className={'prism-lv-out' + (ok === false ? ' is-violated' : '')}
                  onClick={() => onFocusNode(n)}
                  title={n.quote}
                >
                  <span className="prism-lv-out-label">{n.label}</span>
                  <span className="prism-lv-out-val">
                    {v === undefined ? '—' : fmtValue(v, n.unit)}
                  </span>
                  {n.bound && (
                    <span className={'prism-lv-bound' + (ok === false ? ' is-violated' : '')}>
                      {ok === false ? '✕ ' : '✓ '}
                      {n.bound.label ?? `must be ${n.bound.op} ${n.bound.value}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
