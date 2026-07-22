import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { deleteNode, editNode, type MemoryNode } from './store';

// One stored memory fact: view mode shows the concept, age, and body with edit/forget controls;
// edit mode swaps the body for a textarea so the user can CORRECT a stale fact (not just delete it
// and lose it). Keeping memory accurate matters as much as keeping it recent.
const ROW: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  background: 'var(--surface-default)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '7px 10px',
};
const ICON_BTN: CSSProperties = {
  flex: '0 0 auto',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  font: 'inherit',
  lineHeight: 1,
  padding: 0,
};

export function MemoryFactRow({
  node,
  ago,
}: {
  node: MemoryNode;
  ago: string;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.body);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea the moment it mounts for editing — imperatively, not via the autoFocus
  // prop, so a screen reader isn't yanked here without warning.
  useEffect(() => {
    if (editing) draftRef.current?.focus();
  }, [editing]);

  const save = (): void => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== node.body) editNode(node.id, trimmed);
    setEditing(false);
  };
  const cancel = (): void => {
    setDraft(node.body);
    setEditing(false);
  };

  return (
    <li style={ROW}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span
          style={{
            fontFamily: 'var(--font-data, inherit)',
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--presence)',
            letterSpacing: '0.02em',
          }}
        >
          {node.concept}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {ago}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit this fact"
            aria-label={`Edit: ${node.concept}`}
            style={{ ...ICON_BTN, fontSize: 12 }}
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteNode(node.id)}
          title="Forget this concept"
          aria-label={`Forget: ${node.concept}`}
          style={{ ...ICON_BTN, fontSize: 16 }}
        >
          ×
        </button>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label={`Edit memory: ${node.concept}`}
            style={{
              font: 'inherit',
              fontSize: 13,
              lineHeight: 1.4,
              color: 'var(--text-primary)',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '6px 8px',
              resize: 'vertical',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={cancel} style={{ ...ICON_BTN, fontSize: 12 }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draft.trim()}
              style={{ ...ICON_BTN, fontSize: 12, color: 'var(--presence)', fontWeight: 600 }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <span style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{node.body}</span>
      )}
    </li>
  );
}
