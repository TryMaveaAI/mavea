// ask/AskPanel.tsx — the "ask the document" dock: a floating thread over the map. You type a question;
// the answer arrives as a readout with its coverage (in the document / partly / not at all), the
// verbatim span anchors as page chips (tap one to light it on the real page + fly the camera), and —
// when the document fell short and web search is on — one clearly-separated outside fact with a real
// citation. SILENT by default: nothing here speaks; it's a text + spotlight experience for a work desk.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { safeHttpUrl } from '../../../lib/sourceHost';
import type { AnswerSpan, AskCoverage, AskTurn } from './types';
import './ask.css';

export interface AskPanelProps {
  turns: AskTurn[];
  busy: boolean;
  onAsk: (question: string) => void;
  /** Open a span on its real page (highlight + fly the camera). */
  onFocusSpan: (span: AnswerSpan) => void;
  /** The span currently shown in the source panel, so its chip reads as active. */
  activeSpan: AnswerSpan | null;
  multiDoc: boolean;
  /** A short label for a document, for a span chip in multi-document mode. */
  docLabel: (doc: number) => string;
  onClose: () => void;
}

/** Coverage → the honest provenance pill: where this answer actually came from. */
const COVERAGE_META: Record<AskCoverage, { label: string; token: string }> = {
  full: { label: 'in the document', token: 'var(--insight)' },
  partial: { label: 'partly in the document', token: 'var(--warning)' },
  none: { label: 'not in this document', token: 'var(--text-muted)' },
};

function sameSpan(a: AnswerSpan | null, b: AnswerSpan): boolean {
  return !!a && a.doc === b.doc && a.page === b.page && a.quote === b.quote;
}

export function AskPanel({
  turns,
  busy,
  onAsk,
  onFocusSpan,
  activeSpan,
  multiDoc,
  docLabel,
  onClose,
}: AskPanelProps): ReactElement {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the latest turn in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(() => {
    const q = draft.trim();
    if (!q || busy) return;
    onAsk(q);
    setDraft('');
  }, [draft, busy, onAsk]);

  // Stop pointer/wheel from reaching the map (it pans/zooms on those) while interacting with the dock.
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- containment only (see `stop` above), not a click affordance
    <section
      className="prism-ask"
      aria-label="Ask this document"
      onPointerDown={stop}
      onWheel={stop}
      onClick={stop}
    >
      <header className="prism-ask-head">
        <span className="prism-ask-title">
          <span className="prism-ask-spark" aria-hidden="true" />
          Ask this document
        </span>
        <button
          type="button"
          className="prism-ask-min"
          onClick={onClose}
          aria-label="Hide the ask panel"
        >
          ▾
        </button>
      </header>

      <div className="prism-ask-thread" ref={threadRef}>
        {turns.length === 0 && (
          <p className="prism-ask-empty">
            Ask anything. The answer lights up the exact lines on the page — and says so honestly
            when the document doesn’t cover it.
          </p>
        )}
        {turns.map((t) => (
          <div key={t.id} className="prism-ask-turn">
            <p className="prism-ask-q">{t.question}</p>
            {t.status === 'pending' && (
              <p className="prism-ask-pending">
                <span className="prism-ask-dot" aria-hidden="true" />
                Reading the document…
              </p>
            )}
            {t.status === 'error' && <p className="prism-ask-err">{t.error}</p>}
            {t.status === 'done' && t.answer && (
              <div className="prism-ask-a">
                <span
                  className="prism-ask-cover"
                  data-coverage={t.answer.coverage}
                  style={
                    {
                      '--cover-color': COVERAGE_META[t.answer.coverage].token,
                    } as React.CSSProperties
                  }
                >
                  <span className="prism-ask-cover-dot" aria-hidden="true" />
                  {t.answer.unpinned
                    ? 'in the document — couldn’t highlight the exact line'
                    : COVERAGE_META[t.answer.coverage].label}
                </span>
                {t.answer.text && <p className="prism-ask-text">{t.answer.text}</p>}
                {t.answer.spans.length > 0 && (
                  <div
                    className="prism-ask-spans"
                    role="group"
                    aria-label="Where this is in the document"
                  >
                    {t.answer.spans.map((s, i) => (
                      <button
                        type="button"
                        key={`${s.doc}:${s.page}:${i}`}
                        className={'prism-ask-chip' + (sameSpan(activeSpan, s) ? ' is-active' : '')}
                        onClick={() => onFocusSpan(s)}
                        title={s.quote}
                      >
                        {multiDoc ? `${docLabel(s.doc)} · p.${s.page}` : `p.${s.page}`}
                      </button>
                    ))}
                  </div>
                )}
                {t.answer.outside &&
                  (() => {
                    const citeUrl = safeHttpUrl(t.answer.outside.citation.url);
                    const citeBody = (
                      <>
                        “{t.answer.outside.citation.quote}”
                        <span className="prism-ask-outside-host">
                          — {t.answer.outside.citation.host}
                          {t.answer.outside.citation.date
                            ? ` · ${t.answer.outside.citation.date}`
                            : ''}
                        </span>
                      </>
                    );
                    return (
                      <div className="prism-ask-outside">
                        <span className="prism-ask-outside-tag">from outside this document</span>
                        <p className="prism-ask-outside-fact">{t.answer.outside.fact}</p>
                        {/* citeUrl is null only when the search result's own URL isn't plain
                            http(s) — still show the verified quote, just not as a clickable link. */}
                        {citeUrl ? (
                          <a
                            className="prism-ask-outside-cite"
                            href={citeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {citeBody}
                          </a>
                        ) : (
                          <span className="prism-ask-outside-cite">{citeBody}</span>
                        )}
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="prism-ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className="prism-ask-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={busy ? 'Reading the document…' : 'Ask this document a question…'}
          aria-label="Ask this document a question"
        />
        <button
          type="submit"
          className="prism-ask-send"
          disabled={busy || draft.trim().length === 0}
          aria-label="Ask"
        >
          ↵
        </button>
      </form>
    </section>
  );
}
