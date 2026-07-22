// ask/AskRail.tsx — "ask anything about this repo/PR" as a collapsible third column. Visually
// derived from Prism's AskPanel (the same silent, text-first thread: a question, an honest coverage
// pill, citation chips, nothing spoken), reshaped from a floating dock into a column that sits
// beside the main pane and collapses to a bottom sheet on narrow screens. Preset chips read
// differently per altitude so the SAME repo answers new-grad orientation or a principal's crux.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Altitude } from '../model';
import { fileUrl } from '../links';
import type { AskCoverage, RepoAskTurn, RepoCitation } from './types';
import './ask.css';

export interface AskRailSeed {
  text: string;
  /** Bumped every time, so re-seeding the SAME text still re-fills + re-focuses the input. */
  nonce: number;
}

export interface AskRailProps {
  open: boolean;
  onClose: () => void;
  turns: RepoAskTurn[];
  busy: boolean;
  onAsk: (question: string) => void;
  altitude: Altitude;
  /** A model is connected — without one the rail stays honest about not being able to answer,
   *  rather than hiding the affordance outright (matches the course/lesson degrade pattern). */
  hasModel: boolean;
  /** A question to preload into the input (from a node's "Ask" or a lesson's "Ask about this
   *  lesson" chip) — filled in, never auto-sent, so the reader can edit before asking. */
  seed?: AskRailSeed | null;
  repo: string;
  gitRef: string;
  /** A real changed/entry file, for the "What breaks if I change {file}?" preset chip. Undefined
   *  when there's no obvious candidate → that chip is skipped. */
  focusFile?: string;
}

const COVERAGE_META: Record<AskCoverage, { label: string; token: string }> = {
  full: { label: 'grounded in the repo', token: 'var(--insight)' },
  partial: { label: 'partly grounded', token: 'var(--warning)' },
  none: { label: 'not covered by what Ripple has read', token: 'var(--text-muted)' },
};

/** Preset questions per altitude — a one-tap way in, phrased at the depth that level actually wants. */
const PRESET_CHIPS: Record<Altitude, string[]> = {
  newgrad: ['Explain this repo like I’m new', 'Where should I start reading?'],
  working: ['What’s the blast radius of this change?', 'What would I need to know to review this?'],
  principal: ['What’s the crux here?', 'What would a principal push back on?'],
};

function citationLabel(c: RepoCitation): string {
  const base = c.file ? (c.file.split('/').pop() ?? c.file) : 'source';
  return c.unpinned ? `${base} · unverified` : base;
}

export function AskRail({
  open,
  onClose,
  turns,
  busy,
  onAsk,
  altitude,
  hasModel,
  seed,
  repo,
  gitRef,
  focusFile,
}: AskRailProps): ReactElement | null {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // A prefilled question from elsewhere in Ripple (a node's Ask, a lesson's Ask chip) — fill the
  // input and focus it, but never auto-send: the reader may want to tweak it first.
  useEffect(() => {
    if (!seed) return;
    setDraft(seed.text);
    inputRef.current?.focus();
  }, [seed]);

  const submit = useCallback(
    (text?: string) => {
      const q = (text ?? draft).trim();
      if (!q || busy) return;
      onAsk(q);
      setDraft('');
    },
    [draft, busy, onAsk],
  );

  // Stop pointer/wheel from reaching the impact map behind it (it pans/zooms on those), same guard
  // Prism's AskPanel uses over its own map.
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- containment only (see `stop` above), not a click affordance
    <section
      className="ripple-ask-rail"
      aria-label="Ask"
      onPointerDown={stop}
      onWheel={stop}
      onClick={stop}
    >
      <header className="ripple-ask-head">
        <span className="ripple-ask-title">
          <span className="ripple-ask-spark" aria-hidden="true" />
          Ask
        </span>
        <button
          type="button"
          className="ripple-ask-min"
          onClick={onClose}
          aria-label="Collapse the ask rail"
        >
          ✕
        </button>
      </header>

      {!hasModel ? (
        <div className="ripple-ask-empty-state">
          <p>Connect a model in Settings → Live to ask questions about this repo.</p>
        </div>
      ) : (
        <>
          <div className="ripple-ask-chips" role="group" aria-label="Suggested questions">
            {PRESET_CHIPS[altitude].map((q) => (
              <button
                key={q}
                type="button"
                className="ripple-ask-preset"
                onClick={() => submit(q)}
                disabled={busy}
              >
                {q}
              </button>
            ))}
            {focusFile && (
              <button
                type="button"
                className="ripple-ask-preset"
                onClick={() => submit(`What breaks if I change ${focusFile}?`)}
                disabled={busy}
              >
                What breaks if I change {focusFile}?
              </button>
            )}
          </div>

          <div className="ripple-ask-thread" ref={threadRef}>
            {turns.length === 0 && (
              <p className="ripple-ask-empty">
                Ask anything about this repo or PR. The answer cites real files — and says so
                honestly when nothing gathered addresses it.
              </p>
            )}
            {turns.map((t) => (
              <div key={t.id} className="ripple-ask-turn">
                <p className="ripple-ask-q">{t.question}</p>
                {t.status === 'pending' && (
                  <p className="ripple-ask-pending">
                    <span className="ripple-ask-dot" aria-hidden="true" />
                    Reading the repo…
                  </p>
                )}
                {t.status === 'error' && <p className="ripple-ask-err">{t.error}</p>}
                {t.status === 'done' && t.answer && (
                  <div className="ripple-ask-a">
                    <span
                      className="ripple-ask-cover"
                      data-coverage={t.answer.coverage}
                      style={
                        { '--cover-color': COVERAGE_META[t.answer.coverage].token } as
                          | React.CSSProperties
                          | undefined
                      }
                    >
                      <span className="ripple-ask-cover-dot" aria-hidden="true" />
                      {COVERAGE_META[t.answer.coverage].label}
                    </span>
                    {t.answer.text && <p className="ripple-ask-text">{t.answer.text}</p>}
                    {t.answer.citations.length > 0 && (
                      <div className="ripple-ask-cites" role="group" aria-label="Sources">
                        {t.answer.citations.map((c, i) => {
                          const url = c.unpinned ? null : fileUrl(repo, gitRef, c.file);
                          const label = citationLabel(c);
                          const title = `${c.file}\n“${c.quote}”`;
                          return url ? (
                            <a
                              key={`${c.file}:${i}`}
                              className="ripple-ask-cite"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={title}
                            >
                              {label} ↗
                            </a>
                          ) : (
                            <span
                              key={`${c.file}:${i}`}
                              className="ripple-ask-cite"
                              data-unpinned={c.unpinned ? 'true' : undefined}
                              title={title}
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            className="ripple-ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={inputRef}
              className="ripple-ask-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={busy ? 'Reading the repo…' : 'Ask about this repo or PR…'}
              aria-label="Ask about this repo or PR"
            />
            <button
              type="submit"
              className="ripple-ask-send"
              disabled={busy || draft.trim().length === 0}
              aria-label="Ask"
            >
              ↵
            </button>
          </form>
        </>
      )}
    </section>
  );
}
