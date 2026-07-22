// crossexam/CrossExamPanel.tsx — the cross-examination dock: the objections raised against the
// load-bearing claims, OPEN ones (the document never answers) first and prominent, ADDRESSED ones
// collapsed below. Each row is welded to the document's own words; clicking it spotlights that line on
// the real page. Silent, text-first — a defensibility audit, not a gotcha list.
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { OBJECTION_LABEL, type Objection } from './types';
import './crossexam.css';

export interface CrossExamPanelProps {
  objections: Objection[];
  busy: boolean;
  /** Spotlight an objection's anchor on the real page (+ fly the camera). */
  onFocusObjection: (o: Objection) => void;
  activeId: string | null;
  multiDoc: boolean;
  docLabel: (doc: number) => string;
  onClose: () => void;
}

export function CrossExamPanel({
  objections,
  busy,
  onFocusObjection,
  activeId,
  multiDoc,
  docLabel,
  onClose,
}: CrossExamPanelProps): ReactElement {
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);
  const open = objections.filter((o) => o.status === 'open');
  const addressed = objections.filter((o) => o.status === 'addressed');

  const row = (o: Objection): ReactElement => (
    <button
      type="button"
      key={o.id}
      className={'prism-xe-row' + (activeId === o.id ? ' is-active' : '') + ` is-${o.status}`}
      onClick={() => onFocusObjection(o)}
      title={o.anchorQuote}
    >
      <span className="prism-xe-kind">{OBJECTION_LABEL[o.kind]}</span>
      <span className="prism-xe-q">{o.question}</span>
      <span className="prism-xe-where">
        {multiDoc ? `${docLabel(o.doc)} · p.${o.anchorPage}` : `p.${o.anchorPage}`}
        {o.status === 'addressed' && o.rebuttalPage != null && (
          <span className="prism-xe-answered"> · answered p.{o.rebuttalPage}</span>
        )}
      </span>
    </button>
  );

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- containment only (see `stop` above), not a click affordance
    <section
      className="prism-xe"
      aria-label="Cross-examination"
      onPointerDown={stop}
      onWheel={stop}
      onClick={stop}
    >
      <header className="prism-xe-head">
        <span className="prism-xe-title">
          <span className="prism-xe-spark" aria-hidden="true" />
          Cross-examination
        </span>
        <button
          type="button"
          className="prism-xe-min"
          onClick={onClose}
          aria-label="Hide cross-examination"
        >
          ▾
        </button>
      </header>

      {!busy && objections.length > 0 && (
        <p className="prism-xe-standing">
          {objections.length} load-bearing objection{objections.length === 1 ? '' : 's'} · the
          document answers <strong>{addressed.length}</strong>, never answers{' '}
          <strong className="prism-xe-openn">{open.length}</strong>
        </p>
      )}

      <div className="prism-xe-list">
        {busy && (
          <p className="prism-xe-empty">
            <span className="prism-xe-dot" aria-hidden="true" />
            Cross-examining the load-bearing claims…
          </p>
        )}
        {!busy && objections.length === 0 && (
          <p className="prism-xe-empty">
            No objection stuck — the load-bearing claims hold up to their own logic.
          </p>
        )}
        {open.length > 0 && (
          <>
            <p className="prism-xe-group">The document never answers</p>
            {open.map(row)}
          </>
        )}
        {addressed.length > 0 && (
          <>
            <p className="prism-xe-group prism-xe-group-quiet">The document answers these</p>
            {addressed.map(row)}
          </>
        )}
      </div>
    </section>
  );
}
