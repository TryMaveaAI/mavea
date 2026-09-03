// The answer's closing section: contextual next-step chips, follow-up questions, and sources.
// Contextual chips surface Mavéa's deeper features at the exact moment they make sense — after
// a substantive answer — using benefit-first language so the user understands WHY, not just WHAT.
import type { ReactElement } from 'react';
import type { ConversationSpec, SuggestSpec } from '../../data/conversation';
import { GroundedIn } from '../../canvas/provenance';
import { shouldOfferTrack } from '../dashboards/detect';
import { isTeachingAsk } from '../select/complexity';
import { analyzeIntent } from '../select/intent';
import { boardCapable } from '../../canvas/focus/canvasGate';

// A teaching answer with enough substance warrants the "explore deeper" chip.
// Four blocks is the floor — a three-block sketch answer doesn't need level-by-level drilling.
function shouldOfferDeepZoom(question: string, spec: ConversationSpec): boolean {
  return isTeachingAsk(question) && spec.blocks.length >= 4;
}

// A board-shaped answer (a trip, a plan, a comparison) is worth spreading on the spatial Canvas —
// but only NUDGE it here when the ask itself is spatial (planning / comparing / what-if), so the
// chip stays rare. boardCapable is the hard gate; intent only narrows WHEN to surface it, never unlocks.
function shouldOfferCanvas(spec: ConversationSpec, question?: string): boolean {
  if (!boardCapable(spec)) return false;
  if (!question) return true;
  const s = analyzeIntent(question);
  return s.planning || s.comparison || s.whatIf || s.decision || s.troubleshoot;
}

export function AnswerFooter({
  spec,
  followups,
  question,
  onAsk,
  onTrack,
  onDeepZoom,
  onCanvas,
  onSeeAll,
  threadCount,
  busy,
}: {
  spec: ConversationSpec;
  followups: SuggestSpec[];
  /** The user's original question — drives which contextual chips appear. */
  question?: string;
  onAsk: (route: string) => void;
  onTrack?: () => void;
  onDeepZoom?: () => void;
  onCanvas?: () => void;
  /** Compose the WHOLE current topic thread onto one canvas ("See all N moments"). Distinct from
   *  onCanvas, which spreads only THIS answer. Present only when the answer is part of a multi-turn
   *  thread; `threadCount` is that thread's number of moments. */
  onSeeAll?: () => void;
  threadCount?: number;
  busy: boolean;
}): ReactElement | null {
  const sources = spec.sources ?? [];
  const asks = followups.slice(0, 12);
  const offerTrack = !!onTrack && shouldOfferTrack(spec);
  const offerDeepZoom = !busy && !!onDeepZoom && !!question && shouldOfferDeepZoom(question, spec);
  const offerCanvas = !busy && !!onCanvas && shouldOfferCanvas(spec, question);
  const offerSeeAll = !!onSeeAll && (threadCount ?? 0) >= 2;

  const hasContext =
    sources.length > 0 ||
    asks.length > 0 ||
    offerTrack ||
    offerDeepZoom ||
    offerCanvas ||
    offerSeeAll;

  return (
    <section
      className={'answer-footer' + (sources.length > 0 && asks.length > 0 ? '' : ' single')}
      aria-label="Sources, follow-ups, and AI disclaimer"
    >
      {sources.length > 0 && <GroundedIn sources={sources} hosts className="footer-grounded" />}
      {asks.length > 0 && (
        <div className="footer-keepgoing">
          <span className="footer-label">Keep going</span>
          <ul className="footer-list">
            {/* Keyed by position as well as label: the chips are free-text model output, so two
                identical follow-ups would otherwise share one React key. */}
            {asks.map((s, i) => (
              <li key={`${i}-${s.label}`}>
                <button
                  type="button"
                  className="kg-row"
                  onClick={() => onAsk(s.route)}
                  disabled={busy}
                >
                  <span className="kg-q">{s.label}</span>
                  <span className="kg-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(offerTrack || offerDeepZoom || offerCanvas || offerSeeAll) && (
        <div className="footer-chips">
          {offerSeeAll && (
            <button
              type="button"
              className="footer-feature-chip is-thread"
              onClick={onSeeAll}
              title={`Bring all ${threadCount} moments of this topic thread together onto one canvas`}
            >
              {`See all ${threadCount} moments`}
              <span className="footer-chip-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )}
          {offerCanvas && (
            <button
              type="button"
              className="footer-feature-chip"
              onClick={onCanvas}
              title="Spread this answer's cards on a board you can wander — the Mavéa thread joins them up"
            >
              See this answer as a canvas
              <span className="footer-chip-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )}
          {offerDeepZoom && (
            <button
              type="button"
              className="footer-feature-chip"
              onClick={onDeepZoom}
              title="Explore this topic level by level — from the broad field down to the mechanism"
            >
              Explore this step by step
              <span className="footer-chip-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )}
          {offerTrack && (
            <button
              type="button"
              className="footer-track"
              onClick={onTrack}
              disabled={busy}
              title={spec.track?.reason}
            >
              Track this live
              <span className="footer-track-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )}
        </div>
      )}
      <p className={'footer-disclaimer' + (hasContext ? '' : ' only')}>
        AI-generated; may be inaccurate, incomplete, or outdated. Verify important information. Not
        medical, legal, financial, or other professional advice.
      </p>
    </section>
  );
}
