// BlankSlot — "The Blank Space" primitive: one intentionally-empty slot drawn as a glowing hole
// the user fills (by typing, speaking, or dropping a card). Shared by the dedicated `blanks` block
// and, later, by inline {__blank} tokens inside host blocks, so the hole looks identical wherever
// it appears. A blank is the honest stand-in for a value only the user can give — the visual twin
// of refusing to fabricate (see data-real-data-only rule).
import { useContext, useId, useState, type CSSProperties, type ReactElement } from 'react';
import type { Blank, FillValue } from '../../data/conversation';
import { BlankFillContext } from './blankFill';
import './blank.css';

/** Human-readable text for a committed fill (used in the filled-state chip and card labels). */
function describeFill(v: FillValue): string {
  switch (v.kind) {
    case 'number':
      return v.unit ? `${v.value} ${v.unit}` : String(v.value);
    case 'card':
      return v.label;
    default:
      return v.value;
  }
}

export function BlankSlot({ blank }: { blank: Blank }): ReactElement {
  const ctx = useContext(BlankFillContext);
  const [local, setLocal] = useState<FillValue | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const fieldId = useId();

  const value = ctx ? ctx.values[blank.key] : local;
  const active = ctx?.activeKey === blank.key;

  const commit = (v: FillValue) => {
    if (ctx) ctx.fill(v);
    else setLocal(v);
    setEditing(false);
  };
  const clear = () => {
    if (ctx) ctx.unfill?.(blank.key);
    else setLocal(undefined);
    setEditing(false);
  };
  const activate = () => ctx?.activate?.(blank.key);

  const beginEdit = () => {
    setDraft(
      value && (value.kind === 'text' || value.kind === 'number' || value.kind === 'date')
        ? String(value.value)
        : '',
    );
    setEditing(true);
    activate();
  };

  // Commit a typed value, coerced and validated by kind; a blank/invalid entry is a no-op so the
  // hole stays open rather than swallowing a bad value.
  const commitTyped = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (blank.kind === 'number') {
      const n = Number(t);
      if (!Number.isFinite(n)) return;
      commit({ kind: 'number', key: blank.key, value: n, unit: blank.unit });
    } else if (blank.kind === 'date') {
      commit({ kind: 'date', key: blank.key, value: t });
    } else {
      commit({ kind: 'text', key: blank.key, value: t });
    }
  };

  const accentStyle = {
    ['--blank-accent' as string]: blank.accent ?? 'var(--presence)',
  } as CSSProperties;

  // ── filled view: the answered hole, with edit / clear affordances ──
  if (value && !editing) {
    return (
      <div
        className="blank-slot is-filled"
        style={accentStyle}
        data-blank-key={blank.key}
        data-blank-kind={blank.kind}
      >
        <span className="blank-label">{blank.label}</span>
        <div className="blank-value">
          <span className="blank-value-text">{describeFill(value)}</span>
          <span className="blank-actions">
            {blank.kind !== 'choice' && blank.kind !== 'card' && (
              <button
                type="button"
                className="blank-mini"
                onClick={beginEdit}
                aria-label={`Edit ${blank.label}`}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className="blank-mini"
              onClick={clear}
              aria-label={`Clear ${blank.label}`}
            >
              Clear
            </button>
          </span>
        </div>
      </div>
    );
  }

  // ── empty (or re-editing) view: the glowing hole + its input ──
  const inputType = blank.kind === 'date' ? 'date' : blank.kind === 'number' ? 'number' : 'text';

  return (
    <div
      className={`blank-slot is-empty${active ? ' is-active' : ''}`}
      style={accentStyle}
      data-blank-key={blank.key}
      data-blank-kind={blank.kind}
    >
      <label className="blank-label" htmlFor={fieldId}>
        {blank.label}
      </label>

      {blank.kind === 'choice' ? (
        <div className="blank-choices" role="group" aria-label={blank.prompt}>
          {(blank.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              className="blank-chip"
              onClick={() => commit({ kind: 'choice', key: blank.key, value: o })}
            >
              {o}
            </button>
          ))}
        </div>
      ) : blank.kind === 'card' ? (
        <button
          type="button"
          className="blank-drop"
          data-blank-drop={blank.key}
          onClick={activate}
          aria-label={blank.prompt}
        >
          <span className="blank-drop-hint">{blank.placeholder ?? 'Drag a card here'}</span>
        </button>
      ) : (
        <div className="blank-input">
          <input
            id={fieldId}
            className="blank-control"
            type={inputType}
            value={draft}
            placeholder={blank.placeholder ?? blank.prompt}
            aria-label={blank.prompt}
            onFocus={activate}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTyped((e.target as HTMLInputElement).value);
              }
            }}
            onBlur={(e) => commitTyped(e.target.value)}
          />
          {blank.unit && <span className="blank-unit">{blank.unit}</span>}
        </div>
      )}

      <div className="blank-hint">{blank.prompt}</div>
    </div>
  );
}
