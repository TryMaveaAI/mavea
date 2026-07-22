// autopsy/ForecastPanel.tsx — the Forecast Autopsy dock: each of the document's dated predictions
// PREDICTED → ACTUAL → a seal (HELD / MISSED 5× / NOT DUE / UNKNOWN), with the outcome's real citation.
// The predicted side is the document's verbatim words; the actual side is a gate-verified source. Click
// a row to fly to the prediction on its real page. Silent, text-first.
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { safeHttpUrl } from '../../../lib/sourceHost';
import type { ForecastGrade, ForecastStatus } from './types';
import './autopsy.css';

export interface ForecastPanelProps {
  grades: ForecastGrade[];
  busy: boolean;
  onFocusForecast: (g: ForecastGrade) => void;
  activeId: string | null;
  onClose: () => void;
}

const STATUS_META: Record<ForecastStatus, { label: string; token: string }> = {
  hit: { label: 'HELD', token: 'var(--insight)' },
  missed: { label: 'MISSED', token: 'var(--danger)' },
  'not-due': { label: 'NOT DUE', token: '#8c90a0' },
  incomparable: { label: 'NOT COMPARABLE', token: '#8c90a0' },
  unknown: { label: 'UNKNOWN', token: '#8c90a0' },
};

export function ForecastPanel({
  grades,
  busy,
  onFocusForecast,
  activeId,
  onClose,
}: ForecastPanelProps): ReactElement {
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);
  const held = grades.filter((g) => g.status === 'hit').length;
  const missed = grades.filter((g) => g.status === 'missed').length;
  const other = grades.length - held - missed;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- containment only (see `stop` above), not a click affordance
    <section
      className="prism-fa"
      aria-label="Forecast autopsy"
      onPointerDown={stop}
      onWheel={stop}
      onClick={stop}
    >
      <header className="prism-fa-head">
        <span className="prism-fa-title">
          <span className="prism-fa-spark" aria-hidden="true" />
          Forecast autopsy
        </span>
        <button
          type="button"
          className="prism-fa-min"
          onClick={onClose}
          aria-label="Hide forecast autopsy"
        >
          ▾
        </button>
      </header>

      {!busy && grades.length > 0 && (
        <p className="prism-fa-standing">
          {grades.length} prediction{grades.length === 1 ? '' : 's'} graded ·{' '}
          <strong>{held}</strong> held · <strong className="prism-fa-missn">{missed}</strong> missed
          {other > 0 ? ` · ${other} not yet settled` : ''}
        </p>
      )}

      <div className="prism-fa-list">
        {busy && (
          <p className="prism-fa-empty">
            <span className="prism-fa-dot" aria-hidden="true" />
            Grading the document’s predictions against what happened…
          </p>
        )}
        {!busy && grades.length === 0 && (
          <p className="prism-fa-empty">No dated predictions found to grade in this document.</p>
        )}
        {grades.map((g) => {
          // The citation URL comes from search results, so it gets the same scheme gate as every
          // other Prism link (AskPanel, PrismOverlay). A rejected URL still shows the
          // verified quote, just not as a clickable link.
          const citeUrl = g.citation ? safeHttpUrl(g.citation.url) : null;
          const citeBody = g.citation && (
            <>
              “{g.citation.quote}”
              <span className="prism-fa-host">
                — {g.citation.host}
                {g.citation.date ? ` · ${g.citation.date}` : ''}
              </span>
            </>
          );
          // A div, not a <button>: a graded row with a citation carries a real <a> link, and an
          // anchor nested in a button is invalid HTML (hydration warning + flaky clicks) — same
          // reason the claim cards in PrismOverlay use a div+role="button" instead of <button>.
          return (
            <div
              role="button"
              tabIndex={0}
              key={g.claimId}
              className={
                'prism-fa-row' + (activeId === g.claimId ? ' is-active' : '') + ` is-${g.status}`
              }
              onClick={() => onFocusForecast(g)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                onFocusForecast(g);
              }}
              title={g.predicted}
            >
              <span
                className="prism-fa-seal"
                data-status={g.status}
                style={{ '--fa-color': STATUS_META[g.status].token } as React.CSSProperties}
              >
                {STATUS_META[g.status].label}
                {g.factor && g.factor >= 1.5 ? ` ${+g.factor.toFixed(g.factor < 10 ? 1 : 0)}×` : ''}
              </span>
              <span className="prism-fa-pred">
                <span className="prism-fa-tag">PREDICTED</span> {g.predicted}{' '}
                <span className="prism-fa-page">· p.{g.page}</span>
              </span>
              {g.actual && (
                <span className="prism-fa-act">
                  <span className="prism-fa-tag">ACTUAL</span> {g.actual}
                  {g.delta && g.status === 'missed' ? (
                    <span className="prism-fa-delta"> ({g.delta})</span>
                  ) : (
                    ''
                  )}
                </span>
              )}
              {citeBody &&
                (citeUrl ? (
                  <a
                    className="prism-fa-cite"
                    href={citeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {citeBody}
                  </a>
                ) : (
                  <span className="prism-fa-cite">{citeBody}</span>
                ))}
              {!g.actual && <span className="prism-fa-note">{g.note}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
