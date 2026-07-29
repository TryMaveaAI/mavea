// ExtractionPreview — the A3 screen: review what Mavéa found in a conversation before it builds. A
// picker lets you choose WHICH conversation (your latest Live session, or any you've saved to the
// Library), so you're not limited to the most recent. Left = the conversation's words, highlighted by
// what they map to (GOAL / RISK / METRIC). Right = the components Mavéa pulled out, each include/remove
// + a name + Build, or fold into an existing dashboard. Honest: a real model extraction over the live
// transcript when a model's connected, else a grounded draft from the saved canvas.
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { loadSession } from '../session/store';
import { getLibrary } from '../library/store';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import type { ChatMessage } from '../providers/types';
import type { TurnFrame } from '../history';
import { addDashboard, ensureFirstCheck, getDashboards } from './store';
import {
  buildDashboard,
  currentTopicStart,
  extractDashboard,
  foldDraftIntoDashboard,
  groundedDraft,
} from './extract';
import { relatedDashboard } from './relate';
import { boardIds, confirmFailureMessage, confirmRealData } from './confirmAdd';
import { estimateSearchesPerMonth } from './cadence';
import { dashHref } from './route';
import type { Dashboard, DashboardDraft, DataCadenceMode } from './types';
import { useFocusTrap } from '../useFocusTrap';
import './dashboards.css'; // self-contained styling so the overlay can mount on any surface (incl. Live)

type Tag = 'GOAL' | 'RISK' | 'METRIC';
interface Quote {
  text: string;
  tag: Tag;
}

/** One conversation you can build a dashboard from: the live session (full transcript), or a saved
 *  Library canvas (we have its question + canvas, not a full transcript — so it extracts grounded). */
interface ConvoSource {
  id: string;
  label: string;
  history: ChatMessage[];
  frames: TurnFrame[];
  title: string;
  /** True only for the live session, which has a real transcript worth a model extraction. */
  live: boolean;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildSources(): ConvoSource[] {
  const out: ConvoSource[] = [];
  let liveTitle = '';
  const sess = loadSession();
  if (sess && sess.frames.length > 0) {
    // Anchor the title on the frame that started the CURRENT thread, not whichever question was
    // asked most recently — a "more in depth" follow-up shouldn't rename the dashboard.
    const lf = sess.frames[currentTopicStart(sess.frames)];
    liveTitle = lf.question || lf.spec.title || 'Your latest conversation';
    out.push({
      id: 'session',
      label: liveTitle,
      history: sess.history as ChatMessage[],
      frames: sess.frames,
      title: liveTitle,
      live: true,
    });
  }
  for (const e of getLibrary()) {
    const title = e.title || e.question;
    if (liveTitle && norm(title) === norm(liveTitle)) continue; // dedupe vs the live session
    const frame = {
      question: e.question,
      narration: '',
      mode: 'replace',
      tour: [],
      at: e.savedAt,
      spec: e.spec,
    } as unknown as TurnFrame;
    out.push({
      id: 'lib-' + e.id,
      label: title,
      history: [{ role: 'user', content: e.question }],
      frames: [frame],
      title,
      live: false,
    });
  }
  return out;
}

function quotesOf(draft: DashboardDraft): Quote[] {
  const qs: Quote[] = [{ text: draft.thesis.text, tag: 'GOAL' }];
  draft.tripwires.forEach((t) => qs.push({ text: t.sourceQuote.text, tag: 'RISK' }));
  draft.metrics.forEach((m) => qs.push({ text: m.sourceQuote.text, tag: 'METRIC' }));
  return qs.filter((q) => q.text.trim().length > 2);
}

/** Highlight the first matching extracted quote inside one transcript line (verbatim match). */
function renderLine(content: string, quotes: Quote[]): ReactNode {
  const hay = content.toLowerCase();
  for (const q of quotes) {
    const i = hay.indexOf(q.text.toLowerCase());
    if (i >= 0) {
      return (
        <>
          {content.slice(0, i)}
          <mark className={`xt-hl xt-${q.tag.toLowerCase()}`}>
            {content.slice(i, i + q.text.length)}
            <span className="xt-tag">{q.tag}</span>
          </mark>
          {content.slice(i + q.text.length)}
        </>
      );
    }
  }
  return content;
}

export function ExtractionPreview({
  onClose,
  initialSourceId,
}: {
  onClose: () => void;
  /** The chat the user actually landed here from (e.g. a resumed Library entry) — picks the
   *  "Build from" source instead of always defaulting to the live session. Falls back to the
   *  live/first source when unset or when it no longer matches an available source. */
  initialSourceId?: string;
}): ReactElement {
  // Trap focus in the modal and close on Escape (it had neither before).
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, { onEscape: onClose });
  const sources = useMemo(buildSources, []);
  const [sourceId, setSourceId] = useState<string>(() => {
    if (initialSourceId && sources.some((s) => s.id === initialSourceId)) return initialSourceId;
    return sources[0]?.id ?? '';
  });
  const current = useMemo(
    () => sources.find((s) => s.id === sourceId) ?? null,
    [sources, sourceId],
  );

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DashboardDraft | null>(null);
  const [name, setName] = useState('');
  const [dropMetric, setDropMetric] = useState<Set<number>>(new Set());
  const [dropTrip, setDropTrip] = useState<Set<number>>(new Set());
  // Two-tap confirm (the same arm-then-confirm delete idiom used throughout Dashboards): armed
  // only once a fold target has already been flagged as an unlikely match, so an on-topic fold
  // stays a single, frictionless tap.
  const [foldArmed, setFoldArmed] = useState<string | null>(null);
  const ranFor = useRef<string>('');
  // Manual is the default everywhere now — hourly (this builder's old hardcoded standing cadence)
  // is offered as a labeled suggestion instead of silently applying it.
  const [cadence, setCadence] = useState<DataCadenceMode>('manual');

  useEffect(() => {
    if (!current || ranFor.current === current.id) return;
    ranFor.current = current.id;
    setLoading(true);
    setDropMetric(new Set());
    setDropTrip(new Set());
    // Guards a stale extraction: switching the source picker before a model call resolves must
    // not let that older call land over the newer source's draft (it targets a totally different
    // conversation). React runs this cleanup before the next source's effect body, so it's set
    // BEFORE any newer run's `finish` could ever check it.
    let cancelled = false;
    const cfg = toModelConfig(getLiveConfigV2());
    const ready = !!cfg.apiKey;
    const grounded = (): DashboardDraft => groundedDraft(current.history, current.frames);
    const finish = (d: DashboardDraft): void => {
      if (cancelled) return;
      setDraft(d);
      setName(d.title);
      setLoading(false);
    };
    // Only the live session has a real transcript worth a model extraction; saved canvases extract
    // grounded from their stored blocks (we don't keep the full transcript for older conversations).
    if (ready && current.live) {
      extractDashboard(current.history, current.frames, cfg)
        .then((d) => finish(d ?? grounded()))
        .catch(() => finish(grounded()));
    } else {
      finish(grounded());
    }
    return () => {
      cancelled = true;
    };
  }, [current]);

  const quotes = useMemo(() => (draft ? quotesOf(draft) : []), [draft]);
  const existing = useMemo<Dashboard[]>(() => getDashboards(), []);

  const keptDraft = (): DashboardDraft | null => {
    if (!draft) return null;
    return {
      ...draft,
      title: name.trim() || draft.title,
      metrics: draft.metrics.filter((_, i) => !dropMetric.has(i)),
      tripwires: draft.tripwires.filter((_, i) => !dropTrip.has(i)),
    };
  };

  // The add-time reality gate: the first grounded read runs BEFORE the board is handed over,
  // and an addition whose probe can't ground is rolled back with an honest line.
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  // The modal stays dismissible while the probe runs (Escape/backdrop/×), so the post-await
  // continuation must check it's still wanted: yanking the page to the new board's hash a
  // minute after the user closed this and moved on reads as haunted, not helpful. The probe
  // itself still settles either way — the board is confirmed or rolled back regardless.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const build = async (): Promise<void> => {
    const kept = keptDraft();
    if (!kept || !current || confirming) return;
    const dash = buildDashboard(kept, {
      conversationId: norm(current.title),
      conversationTitle: current.title,
      cadence: { data: cadence, ai: 'manual' },
    });
    addDashboard(dash);
    setConfirming(true);
    setConfirmErr(null);
    const outcome = await confirmRealData(dash.id, null);
    if (!alive.current) return;
    setConfirming(false);
    if (outcome !== 'confirmed') {
      setConfirmErr(confirmFailureMessage(outcome));
      return;
    }
    onClose();
    window.location.hash = dashHref.detail(dash.id);
  };

  const fold = async (target: Dashboard): Promise<void> => {
    const kept = keptDraft();
    if (!kept || !current || confirming) return;
    const before = boardIds(target);
    foldDraftIntoDashboard(target, kept, current.title);
    // foldDraftIntoDashboard doesn't arm a first-check itself, unlike a fresh build — a fold into
    // a manual/parked existing board would otherwise never fetch what it just added.
    ensureFirstCheck(target.id);
    setConfirming(true);
    setConfirmErr(null);
    const outcome = await confirmRealData(target.id, before);
    if (!alive.current) return;
    setConfirming(false);
    if (outcome !== 'confirmed') {
      setConfirmErr(confirmFailureMessage(outcome));
      return;
    }
    onClose();
    window.location.hash = dashHref.detail(target.id);
  };

  // Folding is otherwise a single, silent tap — but a picked chip can still be the wrong dashboard
  // (the list is just every dashboard you have, not a search result). Before actually folding, check
  // whether the CHOSEN target is actually the draft's best-related dashboard; if some other dashboard
  // matches better, OR nothing matches at all (the target shares zero relation with the draft — the
  // exact case that most needs a check), the first tap only warns, and a second tap on the same chip
  // is required to go ahead. Only when the target itself is the strongest match does a single tap fold
  // immediately.
  const attemptFold = (target: Dashboard): void => {
    if (foldArmed === target.id) {
      void fold(target);
      return;
    }
    const kept = keptDraft();
    if (!kept) return;
    const match = relatedDashboard(existing, { text: `${kept.title} ${kept.thesis.text}` });
    if (!match || match.id !== target.id) {
      setFoldArmed(target.id);
      return;
    }
    void fold(target);
  };

  return (
    <div
      className="xt-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="xt-modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="What Mavéa found in your conversation"
      >
        <div className="xt-head">
          <span className="xt-head-title">What Mavéa found in your conversation</span>
          <button type="button" className="xt-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {sources.length === 0 ? (
          <div className="xt-empty">
            <p className="dash-empty-title">No conversation to track yet.</p>
            <p className="dash-empty-how">
              Have a conversation in <a href="#/live">Live</a> — talk through a goal, a decision, or
              something you’re tracking — then come back here to turn it into a living dashboard.
            </p>
          </div>
        ) : (
          <>
            {sources.length > 1 && (
              <div className="xt-pick">
                <span className="xt-pick-label">Build from</span>
                <div className="xt-pick-chips">
                  {sources.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={'xt-pick-chip' + (s.id === sourceId ? ' is-active' : '')}
                      onClick={() => setSourceId(s.id)}
                      title={s.title}
                    >
                      {s.live ? '● ' : ''}
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div className="xt-loading">Reading your conversation…</div>
            ) : draft && current ? (
              <div className="xt-split">
                <div className="xt-left">
                  <div className="xt-section-label">
                    {current.live ? 'Your words' : 'The conversation'}
                  </div>
                  {current.history
                    .filter((m) => m.role === 'user')
                    .map((m, i) => (
                      <p key={i} className="xt-line">
                        {renderLine(m.content, quotes)}
                      </p>
                    ))}
                </div>
                <div className="xt-right">
                  <div className="xt-section-label">Components — include or remove</div>

                  <div className="xt-comp xt-comp--goal">
                    <div className="xt-comp-head">
                      <span className="xt-comp-kind">GOAL</span>
                    </div>
                    <div className="xt-comp-body">“{draft.thesis.text}”</div>
                  </div>

                  {draft.metrics.map((m, i) => (
                    <Comp
                      key={`m${i}`}
                      kind="METRIC"
                      body={`${m.label}${m.userSupplied ? ' · you’ll fill this' : ''}`}
                      on={!dropMetric.has(i)}
                      onToggle={() => toggle(setDropMetric, i)}
                    />
                  ))}
                  {draft.tripwires.map((t, i) => (
                    <Comp
                      key={`t${i}`}
                      kind="RISK"
                      body={`Alert: ${t.label}`}
                      on={!dropTrip.has(i)}
                      onToggle={() => toggle(setDropTrip, i)}
                    />
                  ))}

                  <div className="xt-pick xt-cadence-pick">
                    <span className="xt-pick-label">How often</span>
                    <div className="xt-pick-chips">
                      <button
                        type="button"
                        className={'xt-pick-chip' + (cadence === 'manual' ? ' is-active' : '')}
                        aria-pressed={cadence === 'manual'}
                        onClick={() => setCadence('manual')}
                      >
                        Manual — only when you ask
                      </button>
                      <button
                        type="button"
                        className={'xt-pick-chip' + (cadence === 'hourly' ? ' is-active' : '')}
                        aria-pressed={cadence === 'hourly'}
                        onClick={() => setCadence('hourly')}
                      >
                        Suggested — hourly checks
                      </button>
                    </div>
                  </div>
                  <p className="dash-plan-estimate">
                    {estimateSearchesPerMonth(cadence) > 0
                      ? `≈ ${estimateSearchesPerMonth(cadence)} searches/mo on your key, at this cadence — change it any time from the dashboard.`
                      : 'No standing searches — this refreshes only when you ask.'}
                  </p>
                  <div className="xt-build-row">
                    <input
                      className="xt-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Dashboard name"
                    />
                    <button
                      type="button"
                      className="xt-build"
                      disabled={confirming}
                      onClick={() => void build()}
                    >
                      {confirming ? 'Confirming live data…' : 'Build dashboard →'}
                    </button>
                  </div>
                  {confirmErr && <p className="dash-plan-estimate">{confirmErr}</p>}

                  {existing.length > 0 && (
                    <div className="xt-fold">
                      <div className="xt-fold-label">
                        Or add this conversation to an existing dashboard
                      </div>
                      <div className="xt-fold-chips">
                        {existing.map((dd) => {
                          const armed = foldArmed === dd.id;
                          return (
                            <button
                              key={dd.id}
                              type="button"
                              className={'xt-fold-chip' + (armed ? ' xt-fold-armed' : '')}
                              onClick={() => attemptFold(dd)}
                              onMouseLeave={() => armed && setFoldArmed(null)}
                              title={
                                armed
                                  ? `This doesn’t look related to “${dd.title}” — fold anyway?`
                                  : `Fold these into “${dd.title}”`
                              }
                            >
                              {armed ? `Doesn’t look related — fold anyway?` : `+ ${dd.title}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function toggle(set: (fn: (s: Set<number>) => Set<number>) => void, i: number): void {
  set((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });
}

function Comp({
  kind,
  body,
  on,
  onToggle,
}: {
  kind: Tag;
  body: string;
  on: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <div className={`xt-comp xt-comp--${kind.toLowerCase()} ${on ? '' : 'xt-off'}`}>
      <div className="xt-comp-head">
        <span className="xt-comp-kind">{kind}</span>
        <button type="button" className="xt-comp-toggle" onClick={onToggle}>
          {on ? 'Included ✓' : 'Removed ✕'}
        </button>
      </div>
      <div className="xt-comp-body">{body}</div>
    </div>
  );
}
