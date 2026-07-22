// ShipSuggestions.tsx — "the principal in the review": the few observations actually worth your
// attention, with the shallow nits deliberately suppressed. Every suggestion is grounded — it cites
// the real refs that made Mavéa raise it — so it reads as judgement, not a linter dump. Reads only
// from the grounded model; one card open at a time, the first by default. Concept 08 §10.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { SectionProps } from './types';
import './shipsuggestions.css';

/** Each lens gets a stable accent from the shared token set, keyed off its first word so a compound
 *  category ("DATA / COST") still resolves. Falls back to presence for any lens we haven't named. */
const CATEGORY_VAR: Record<string, string> = {
  CONCURRENCY: 'var(--presence)',
  COMPATIBILITY: 'var(--warning)',
  RESILIENCE: 'var(--danger)',
  OBSERVABILITY: 'var(--insight)',
  DATA: 'var(--presence-deep)',
};

function categoryVar(category: string): string {
  const head = category.split(/[\s/]/)[0]?.toUpperCase() ?? '';
  return CATEGORY_VAR[head] ?? 'var(--presence)';
}

export function ShipSuggestions({ model }: SectionProps): ReactElement {
  const { suggestions, suppressedNits } = model;
  // One open at a time; default the first suggestion open so the section never reads as a wall of
  // collapsed rows. Empty list → no open id, handled by the empty state below.
  const [openId, setOpenId] = useState<string | null>(suggestions[0]?.id ?? null);

  return (
    <div className="ripple-sg">
      <div className="ripple-eyebrow">What a principal would flag</div>

      <div className="ripple-sg-signal">
        <span className="ripple-sg-orb" aria-hidden="true" />
        <span className="ripple-sg-count">
          <strong>{suggestions.length}</strong> worth your time
        </span>
        {suppressedNits > 0 && (
          <span className="ripple-sg-muted">{suppressedNits} shallow nits suppressed</span>
        )}
        <span className="ripple-sg-grounded">
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path
              d="M2.5 6.4 4.8 8.8 9.5 3.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Every one is grounded
        </span>
      </div>

      {suggestions.length === 0 ? (
        <div className="ripple-sg-empty">
          Nothing rose above the noise floor — this change reads clean to a principal eye.
        </div>
      ) : (
        <ul className="ripple-sg-list">
          {suggestions.map((s) => {
            const open = s.id === openId;
            const accent = categoryVar(s.category);
            const panelId = `ripple-sg-panel-${s.id}`;
            return (
              <li
                className="ripple-sg-card"
                key={s.id}
                data-open={open}
                style={{ '--ripple-sg-accent': accent } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="ripple-sg-trigger"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : s.id)}
                >
                  <span className="ripple-sg-cat">{s.category}</span>
                  <span className="ripple-sg-title">{s.title}</span>
                  <span className="ripple-sg-gist">{s.gist}</span>
                  <svg
                    className="ripple-sg-chev"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M3 4.5 6 7.5 9 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {open && (
                  <div className="ripple-sg-body" id={panelId}>
                    <p className="ripple-sg-why">{s.why}</p>

                    <div className="ripple-sg-evidence">
                      <div className="ripple-eyebrow">Why you’re seeing this</div>
                      <p className="ripple-sg-evidence-text">{s.evidence}</p>
                    </div>

                    <div className="ripple-sg-fix">
                      <span className="ripple-sg-check" aria-hidden="true">
                        <svg viewBox="0 0 14 14" focusable="false">
                          <path
                            d="M3 7.4 5.8 10.2 11 4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <p className="ripple-sg-fix-text">
                        <span className="ripple-sg-fix-label">Suggested:</span> {s.fix}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {suppressedNits > 0 && (
        <div className="ripple-sg-suppressed" role="note">
          <strong>{suppressedNits} nits suppressed</strong> — formatting, naming, import order…
          Mavéa won’t spend your attention on them.
        </div>
      )}
    </div>
  );
}
