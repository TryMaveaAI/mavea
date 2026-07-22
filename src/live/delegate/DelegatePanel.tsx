// The Table: hand Mavéa a negotiation to scout. The user writes the brief (the goal, what's on
// the table, what's NEVER offered, and the other side's position as they understand it), and
// two real agents talk it out on the user's key — your Mavéa versus a clearly-labeled stand-in
// for the counterpart. The log is the actual exchange; a reached deal ends "pending both
// humans": you hold to approve YOUR side, then send the summary yourself. A debrief afterward
// reads the real transcript back — what moved them, where the case is exposed, what to open
// with for real — and the whole run can be handed to Live as one grounded, honest turn.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { ModelConfig } from '../../types/mavea';
import { Presence } from '../../presence/Presence';
import { isHidden } from '../../lib/pageVisibility';
import { getAdapter } from '../providers';
import { useFocusTrap } from '../useFocusTrap';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import {
  DEFAULT_MAX_ROUNDS,
  negotiate,
  parseBoundaries,
  standingOffer,
  type NegotiationBrief,
  type NegotiationEvent,
  type NegotiationSide,
} from './negotiate';
import { buildPrepInstruction, prepLabel, runDebrief, type Debrief } from './debrief';
import { tableLook, SAY_MS, POINT_MS, type TablePhase } from './tableLook';
import './delegate.css';

/** One model call through the active provider — the engine's transport. The abort signal is
 *  threaded into the request so Stop (or closing the panel) cancels the in-flight generation
 *  instead of letting it run to completion on the user's key after they've walked away.
 *  `maxTokens` defaults to a negotiation turn's budget; the debrief asks for a longer one. */
function agentCall(cfg: ModelConfig, signal?: AbortSignal, maxTokens = 300) {
  return async (system: string, user: string): Promise<string> => {
    const out = await getAdapter(cfg.provider).generate(
      { system, history: [], user, maxTokens, temperature: 0.7, signal },
      cfg,
    );
    return typeof out.raw === 'string' ? out.raw : JSON.stringify(out.raw);
  };
}

const HOLD_MS = 1200;

/** A ready-made brief: one tap fills the whole form with a relatable, plausible setup, so
 *  the feature reads at a glance and a curious user can run it without inventing a case. */
interface Seed {
  tag: string;
  counterpart: string;
  goal: string;
  mine: string;
  theirs: string;
  boundaries: string;
}
const SEEDS: Seed[] = [
  {
    tag: 'Ask for a raise',
    counterpart: 'Priya',
    goal: 'A raise to $95k, up from $82k, this cycle',
    mine: 'I led the billing migration and can mentor two juniors',
    theirs:
      "My manager. Budget's tight this quarter; she values retention and won't set precedents",
    boundaries: 'working weekends, a title bump instead of pay',
  },
  {
    tag: 'Buy a used car',
    counterpart: 'the dealer',
    goal: 'Get the 2019 Civic to $14,000 out the door',
    mine: 'Pay cash today, skip the extended warranty, take it as-is',
    theirs: "Wants it off the lot this month; won't budge on the doc fee",
    boundaries: 'going above $15,000, financing through them',
  },
  {
    tag: 'Split the rent',
    counterpart: 'Sam',
    goal: 'Split rent by room size — I take the smaller room for $200 less',
    mine: "I'll set up the utilities and cover the parking spot",
    theirs: 'My roommate. Thinks a straight 50/50 split is only fair, and always pays on time',
    boundaries: 'paying more than half',
  },
];

const fmtClock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function CloseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ShieldIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 2.5v5c0 4.4-2.9 8-7 9.5-4.1-1.5-7-5.1-7-9.5v-5L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M4 12.5l5 5 11-12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A line's speaker, small — attribution inside the scrolling exchange. The bigger, expressive
 *  read of each side lives at the table itself (the two jellies in .dlg-tablescape); this stays
 *  a name and a dot on purpose. */
function SideChip({ side, name }: { side: NegotiationSide; name: string }): ReactElement {
  const yours = side === 'yours';
  return (
    <span className={`dlg-side ${side}`}>
      <span className="dlg-avatar" aria-hidden="true" />
      <span className="dlg-side-text">
        <span className="dlg-side-name">{yours ? 'Your Mavéa' : name}</span>
      </span>
    </span>
  );
}

/** Rounds-used-of-cap, framed as progress rather than a bare count. */
function RoundMeter({ turns, running }: { turns: number; running: boolean }): ReactElement {
  const current = running ? Math.min(turns + 1, DEFAULT_MAX_ROUNDS) : turns;
  return (
    <div
      className="dlg-rounds"
      aria-label={running ? `Round ${current} of ${DEFAULT_MAX_ROUNDS}` : `${turns} turns`}
    >
      <span className="dlg-rounds-label">
        {running ? `Round ${current}` : `${turns} turn${turns === 1 ? '' : 's'}`}
      </span>
      <span className="dlg-rounds-track" aria-hidden="true">
        {Array.from({ length: DEFAULT_MAX_ROUNDS }).map((_, i) => (
          <i key={i} className={i < turns ? 'on' : i === turns && running ? 'now' : ''} />
        ))}
      </span>
    </div>
  );
}

/** The board's hold-to-confirm: press and keep pressing — releasing early cancels. Exported for
 *  a focused unit test of its press/repeat/cancel timing (the approve action it guards is
 *  irreversible-feeling, so its once-only firing is worth pinning). */
export function HoldButton({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}): ReactElement {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = (): void => {
    // Never stack timers — a pointer-then-key interleave or a re-entrant start would otherwise
    // leave an orphaned timeout that fires (and confirms) after this one is cancelled.
    window.clearTimeout(timer.current);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  const cancel = (): void => {
    setHolding(false);
    window.clearTimeout(timer.current);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={'dlg-hold' + (holding ? ' holding' : '')}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        // Ignore the OS key-repeat while held down: re-arming on every repeat would either
        // stack timers or endlessly push the deadline back (the hold could never complete),
        // and firing onConfirm per repeat would approve — and copy — several times over.
        if (e.repeat) return;
        if (e.key === 'Enter' || e.key === ' ') start();
      }}
      onKeyUp={cancel}
    >
      <span className="dlg-hold-fill" aria-hidden="true" />
      <span className="dlg-hold-label">{label}</span>
    </button>
  );
}

/** A finished run, kept only for the session's own compact "runs so far" strip — not persisted,
 *  not clickable, gone when the panel closes. */
interface RunSummary {
  n: number;
  outcome: 'deal' | 'nodeal' | 'stopped';
  deal: string | null;
  turns: number;
}

type DebriefState = 'idle' | 'loading' | Debrief | 'failed';

/**
 * Drives the transient "mid-line" look: which side just landed a line, whether it carried an
 * offer, and — for yours only — whether the beat has advanced from saying it to pointing at it
 * on the table. Keyed off the events array growing, not the stage, so a fresh run's first line
 * always starts a clean beat, and every timer is cleared on the next line or on unmount.
 */
function useSpeakBeat(
  events: NegotiationEvent[],
): { side: NegotiationSide; offer: boolean; pointing: boolean } | null {
  const [speaking, setSpeaking] = useState<{
    side: NegotiationSide;
    offer: boolean;
    pointing: boolean;
  } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const seenRef = useRef(0);

  useEffect(() => {
    if (events.length === seenRef.current) return;
    seenRef.current = events.length;
    window.clearTimeout(timerRef.current);
    const last = events[events.length - 1];
    if (!last || last.side === 'engine') {
      setSpeaking(null);
      return;
    }
    const offer = Boolean(last.offer);
    setSpeaking({ side: last.side, offer, pointing: false });
    if (last.side === 'yours' && offer) {
      timerRef.current = window.setTimeout(() => {
        setSpeaking({ side: 'yours', offer: true, pointing: true });
        timerRef.current = window.setTimeout(() => setSpeaking(null), POINT_MS);
      }, SAY_MS);
    } else {
      timerRef.current = window.setTimeout(() => setSpeaking(null), SAY_MS);
    }
  }, [events]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return speaking;
}

function speakerLabel(e: NegotiationEvent, them: string): string {
  return e.side === 'yours' ? 'Your Mavéa' : e.side === 'theirs' ? `${them}’s stand-in` : 'Referee';
}

/** The payoff after a run: what moved them, where the case is exposed, what to open with for
 *  real — every cited excerpt is looked up from the actual transcript, never re-typed by the
 *  model, so nothing shown here can be a fabricated quote. */
function DebriefSection({
  debrief,
  events,
  themLabel,
  onRetry,
}: {
  debrief: DebriefState;
  events: NegotiationEvent[];
  themLabel: string;
  onRetry: () => void;
}): ReactElement | null {
  if (debrief === 'idle') return null;
  if (debrief === 'loading') {
    return (
      <div className="dlg-debrief" data-state="loading">
        <span className="dlg-debrief-eyebrow">Debrief — drawn from this run</span>
        <p className="dlg-debrief-wait">Reading back what happened…</p>
      </div>
    );
  }
  if (debrief === 'failed') {
    return (
      <div className="dlg-debrief" data-state="failed">
        <span className="dlg-debrief-eyebrow">Debrief — drawn from this run</span>
        <p className="dlg-debrief-wait">Couldn’t draw a debrief from this run.</p>
        <button type="button" className="dlg-debrief-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  // "turn" here is a 1-based line number into the FULL event log (referee lines included) —
  // distinct from the panel's own "turns" count (party moves only), which drives RoundMeter.
  const excerpt = (turn: number | null): ReactElement | null => {
    if (turn === null) return null;
    const e = events[turn - 1];
    if (!e) return null;
    return (
      <p className="dlg-debrief-quote">
        <span className="dlg-debrief-quote-who">{speakerLabel(e, themLabel)}</span>
        {`“${e.say}”`}
      </p>
    );
  };
  return (
    <div className="dlg-debrief" data-state="ready">
      <span className="dlg-debrief-eyebrow">Debrief — drawn from this run</span>
      {debrief.moved.length > 0 && (
        <div className="dlg-debrief-group">
          <h4>What moved them</h4>
          <ul>
            {debrief.moved.map((c, i) => (
              <li key={i}>
                <p className="dlg-debrief-point">{c.point}</p>
                {excerpt(c.turn)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {debrief.exposed.length > 0 && (
        <div className="dlg-debrief-group">
          <h4>Where you’re exposed</h4>
          <ul>
            {debrief.exposed.map((c, i) => (
              <li key={i}>
                <p className="dlg-debrief-point">{c.point}</p>
                {excerpt(c.turn)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {debrief.openers.length > 0 && (
        <div className="dlg-debrief-group">
          <h4>Say this first</h4>
          <ol className="dlg-debrief-openers">
            {debrief.openers.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
          <p className="dlg-debrief-footnote">
            Mavéa’s suggestions, drawn from the run above — the stand-in only knows what you wrote.
          </p>
        </div>
      )}
    </div>
  );
}

type Stage = 'brief' | 'running' | 'done';

export function DelegatePanel({
  cfg,
  onClose,
  onPrepTurn,
}: {
  cfg: ModelConfig;
  onClose: () => void;
  /** Hand a finished run to Live as one normal, grounded turn — omit to hide the action. */
  onPrepTurn?: (instruction: string, label: string) => void;
}): ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef);
  const logRef = useRef<HTMLOListElement>(null);
  const [stage, setStage] = useState<Stage>('brief');
  const [counterpart, setCounterpart] = useState('');
  const [goal, setGoal] = useState('');
  const [mine, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const [boundaries, setBoundaries] = useState('');
  const [seedPulse, setSeedPulse] = useState(false);
  const [events, setEvents] = useState<NegotiationEvent[]>([]);
  const [deal, setDeal] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [debrief, setDebrief] = useState<DebriefState>('idle');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debriefAbortRef = useRef<AbortController | null>(null);
  // Mirrors `stopped` for the negotiation's completion callback below: that closure was created
  // when `begin()` was last called, so the plain `stopped` state it captured is stale by the
  // time the promise settles — a ref always reads the value as of right now.
  const stoppedRef = useRef(false);
  // Guards the negotiation's async resolution against a panel that has since closed — Stop must
  // still land its terminal state (component alive), but an unmount must not setState on a dead tree.
  const mountedRef = useRef(true);

  // A visible clock while the Maveas talk — paused while the tab is backgrounded so it never
  // races ahead of a throttled/hidden session, and read as tension, not a bare stopwatch.
  useEffect(() => {
    if (stage !== 'running') return;
    const iv = window.setInterval(() => {
      if (isHidden()) return;
      setElapsed((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [stage]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      debriefAbortRef.current?.abort();
    },
    [],
  );

  // Esc always closes — an open overlay must never strand the user (a stuck panel reads
  // as "the app stopped accepting input").
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the newest line of the exchange in view as it streams in — the transcript scrolls
  // inside its own pane, never the panel or the page.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  const boundaryList = useMemo(() => parseBoundaries(boundaries), [boundaries]);
  const brief = useMemo<NegotiationBrief>(
    () => ({
      counterpart: counterpart.trim(),
      goal: goal.trim(),
      mine: mine.trim(),
      theirs: theirs.trim(),
      boundaries: boundaryList,
    }),
    [counterpart, goal, mine, theirs, boundaryList],
  );
  const standing = useMemo(() => standingOffer(events), [events]);
  const turns = events.filter((e) => e.side !== 'engine').length;
  const boundaryHit = events.some((e) => e.side === 'engine');
  // The most recent event is a withheld offer, still waiting on yours' retry — the moment the
  // table's choreography reads as guarded rather than merely thinking.
  const guarded = events.length > 0 && events[events.length - 1].side === 'engine';
  // Whoever didn't just speak is up next; a withheld offer (engine event) keeps the same
  // side thinking, and your Mavéa opens.
  const lastParty = [...events].reverse().find((e) => e.side !== 'engine');
  const whoseTurn: NegotiationSide = lastParty
    ? lastParty.side === 'yours'
      ? 'theirs'
      : 'yours'
    : 'yours';
  const speaking = useSpeakBeat(events);

  const tablePhase: TablePhase = useMemo(() => {
    if (stage === 'done') {
      if (deal && approved) return { kind: 'approved' };
      if (deal) return { kind: 'deal' };
      if (stopped) return { kind: 'stopped' };
      return { kind: 'nodeal', boundaryHeld: boundaryHit };
    }
    return { kind: 'running', whoseTurn, guarded, speaking };
  }, [stage, deal, approved, stopped, boundaryHit, whoseTurn, guarded, speaking]);
  const look = tableLook(tablePhase);

  const ready = Boolean(counterpart.trim() && goal.trim() && mine.trim() && theirs.trim());
  const themLabel = counterpart.trim() || 'the other side';

  const seedMatches = (s: Seed): boolean =>
    counterpart === s.counterpart &&
    goal === s.goal &&
    mine === s.mine &&
    theirs === s.theirs &&
    boundaries === s.boundaries;

  const applySeed = (s: Seed): void => {
    setCounterpart(s.counterpart);
    setGoal(s.goal);
    setMine(s.mine);
    setTheirs(s.theirs);
    setBoundaries(s.boundaries);
    // Retrigger the one-shot fill flash even on repeated clicks: drop the class, then re-add it
    // next frame so the browser sees a fresh animation rather than a no-op re-application.
    setSeedPulse(false);
    requestAnimationFrame(() => {
      if (mountedRef.current) setSeedPulse(true);
    });
  };

  const startDebrief = (evs: NegotiationEvent[], dealResult: string | null): void => {
    setDebrief('loading');
    const ac = new AbortController();
    debriefAbortRef.current = ac;
    void runDebrief(brief, evs, dealResult, agentCall(cfg, ac.signal, 500), ac.signal).then(
      (result) => {
        // A superseded debrief (aborted by a fresh "Run it again"/"Adjust the brief" while this
        // one was still in flight) still resolves — never let its late answer land on top of
        // whatever the newer run has already set.
        if (!mountedRef.current || ac.signal.aborted) return;
        setDebrief(result ?? 'failed');
      },
    );
  };

  const begin = (): void => {
    if (!ready) return;
    const ac = new AbortController();
    abortRef.current = ac;
    debriefAbortRef.current?.abort();
    setEvents([]);
    setDeal(null);
    setApproved(false);
    setCopied(false);
    setStopped(false);
    stoppedRef.current = false;
    setElapsed(0);
    setDebrief('idle');
    setStage('running');
    void negotiate(
      brief,
      agentCall(cfg, ac.signal),
      (e) => {
        if (mountedRef.current) setEvents((cur) => [...cur, e]);
      },
      ac.signal,
    )
      .then((r) => {
        if (!mountedRef.current) return;
        setDeal(r.deal);
        setStage('done');
        const partyTurns = r.events.filter((e) => e.side !== 'engine').length;
        setRuns((cur) => [
          ...cur,
          {
            n: cur.length + 1,
            outcome: stoppedRef.current ? 'stopped' : r.deal ? 'deal' : 'nodeal',
            deal: r.deal,
            turns: partyTurns,
          },
        ]);
        // Stop means stop spending — no automatic extra call. A natural end always gets the
        // payoff, unless the run barely started (nothing to debrief from one or two lines).
        if (!stoppedRef.current && partyTurns >= 2) startDebrief(r.events, r.deal);
      })
      // negotiate resolves even on a swallowed call error, but never leave the panel stranded on
      // the running stage if it ever rejects — settle into the terminal (no-deal) view instead.
      .catch(() => {
        if (mountedRef.current) setStage('done');
      });
  };

  const stop = (): void => {
    stoppedRef.current = true;
    setStopped(true);
    abortRef.current?.abort();
  };

  const handleBringIntoConversation = (): void => {
    onPrepTurn?.(buildPrepInstruction(brief, events, deal), prepLabel(brief.goal));
  };

  return (
    <div
      className="dlg-scrim"
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
      <section
        className="dlg-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="The Table — scout a negotiation"
        data-stage={stage}
      >
        <header className="dlg-head">
          <div className="dlg-head-id">
            {stage === 'brief' && (
              <span className="dlg-jelly brief" aria-hidden="true">
                <Presence state={ready ? 'thinking' : 'reading'} gaze={ready ? 'center' : 'down'} />
              </span>
            )}
            <div className="dlg-title">
              <h2>The Table</h2>
              <p className="dlg-kicker">
                {stage === 'brief'
                  ? 'Scout the deal before you have it for real'
                  : 'Two agents, talking it out on your key'}
              </p>
            </div>
          </div>
          <button type="button" className="dlg-x" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        {stage === 'brief' && (
          <form
            className="dlg-brief"
            onSubmit={(e) => {
              e.preventDefault();
              begin();
            }}
          >
            <p className="dlg-lede">
              Two agents talk it out on your key — your Mavéa against a <strong>stand-in</strong>{' '}
              for the other side, built only from what you write here. A few short turns, then a
              debrief of what moved them — about the cost of one answer. Nothing is sent to{' '}
              {themLabel}.
            </p>
            <FeatureUseNotice kind="simulation" from="live" />

            <div className="dlg-seeds" role="group" aria-label="Start from an example">
              <span className="dlg-seeds-label">Try one</span>
              {SEEDS.map((s) => (
                <button
                  key={s.tag}
                  type="button"
                  className="dlg-seed"
                  aria-pressed={seedMatches(s)}
                  onClick={() => applySeed(s)}
                >
                  {s.tag}
                </button>
              ))}
            </div>

            <fieldset className={'dlg-group' + (seedPulse ? ' dlg-seed-fill' : '')}>
              <legend>The other side</legend>
              <label className="dlg-field">
                <span className="dlg-field-name">Who you're negotiating with</span>
                <input
                  value={counterpart}
                  onChange={(e) => setCounterpart(e.target.value)}
                  placeholder="Priya, my manager"
                />
              </label>
              <label className="dlg-field">
                <span className="dlg-field-name">Their position, as you see it</span>
                <textarea
                  rows={2}
                  value={theirs}
                  onChange={(e) => setTheirs(e.target.value)}
                  placeholder="Budget's tight this quarter; she values retention and won't set precedents"
                />
                <span className="dlg-field-hint">
                  This is all the stand-in knows — it argues only from this.
                </span>
              </label>
            </fieldset>

            <fieldset className={'dlg-group' + (seedPulse ? ' dlg-seed-fill' : '')}>
              <legend>Your side</legend>
              <label className="dlg-field">
                <span className="dlg-field-name">What you're after</span>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="A raise to $95k, up from $82k, this cycle"
                />
              </label>
              <label className="dlg-field">
                <span className="dlg-field-name">What you'll put on the table</span>
                <textarea
                  rows={2}
                  value={mine}
                  onChange={(e) => setMine(e.target.value)}
                  placeholder="I led the billing migration; I can mentor two juniors"
                />
              </label>
            </fieldset>

            <fieldset className={'dlg-group dlg-group-line' + (seedPulse ? ' dlg-seed-fill' : '')}>
              <legend>
                Your line <span className="dlg-enforced">enforced</span>
              </legend>
              <p className="dlg-line-note">
                Mavéa never offers these. Every proposal is checked in code, and any that crosses
                your line is pulled back — not just discouraged.
              </p>
              <label className="dlg-field">
                <span className="dlg-field-name sr-only">Never offer</span>
                <input
                  value={boundaries}
                  onChange={(e) => setBoundaries(e.target.value)}
                  placeholder="working weekends, a title bump instead of pay"
                />
              </label>
              {boundaryList.length > 0 && (
                <ul className="dlg-line-chips" aria-hidden="true">
                  {boundaryList.map((b) => (
                    <li key={b} className="dlg-line-chip">
                      <ShieldIcon />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <div className="dlg-brief-actions">
              <button type="submit" className="dlg-start" disabled={!ready}>
                Start the negotiation
              </button>
              <span className="dlg-brief-cost">
                ≈ one answer's worth of calls, debrief included
              </span>
            </div>
          </form>
        )}

        {stage !== 'brief' && (
          <div className="dlg-table">
            <div className="dlg-tablescape">
              <div className="dlg-seat yours">
                <span className="dlg-jelly" aria-hidden="true">
                  <Presence {...look.yours} />
                </span>
                <span className="dlg-seat-name">Your Mavéa</span>
              </div>
              <div className="dlg-meta">
                <RoundMeter turns={turns} running={stage === 'running'} />
                <span className="dlg-clock tab-num" aria-label={`${elapsed} seconds elapsed`}>
                  {fmtClock(elapsed)}
                </span>
              </div>
              <div className="dlg-seat theirs">
                <span className="dlg-jelly ghost" aria-hidden="true">
                  <Presence {...look.theirs} />
                </span>
                <span className="dlg-seat-name">{counterpart}</span>
                <span className="dlg-seat-tag">stand-in</span>
              </div>
            </div>

            <div
              className="dlg-offer"
              data-empty={standing ? undefined : true}
              data-by={standing?.by}
            >
              <span className="dlg-offer-eyebrow">On the table</span>
              {standing ? (
                <>
                  <p className="dlg-offer-text" key={standing.offer}>
                    {standing.offer}
                  </p>
                  <span className="dlg-offer-by">
                    {standing.by === 'yours'
                      ? 'Your Mavéa proposed this'
                      : `${themLabel}'s stand-in countered`}
                  </span>
                </>
              ) : (
                <p className="dlg-offer-empty">
                  {stage === 'running' ? 'Opening the table…' : 'No offer was tabled.'}
                </p>
              )}
            </div>

            <ol
              className="dlg-log"
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label="The exchange"
            >
              {events.map((e, i) =>
                e.side === 'engine' ? (
                  <li key={i} className="dlg-referee">
                    <ShieldIcon />
                    <span>{e.say}</span>
                  </li>
                ) : (
                  <li key={i} className={`dlg-turn ${e.side} ${e.kind}`}>
                    <SideChip side={e.side} name={counterpart} />
                    <p className="dlg-turn-say">{e.say}</p>
                    {e.offer && e.kind !== 'accept' && (
                      <span className="dlg-turn-tag">Now on the table</span>
                    )}
                    {e.kind === 'accept' && <span className="dlg-turn-tag agreed">Accepted</span>}
                  </li>
                ),
              )}
              {stage === 'running' && (
                <li className={`dlg-turn ${whoseTurn} thinking`} aria-hidden="true">
                  <SideChip side={whoseTurn} name={counterpart} />
                  <span className="dlg-typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </li>
              )}
            </ol>

            {stage === 'running' && (
              <div className="dlg-foot">
                <button type="button" className="dlg-stop" onClick={stop}>
                  Stop
                </button>
              </div>
            )}

            {stage === 'done' && deal && !approved && (
              <div className="dlg-result deal">
                <div className="dlg-result-head">
                  <span className="dlg-result-mark">
                    <CheckIcon />
                  </span>
                  <h3>Both Mavéas agreed</h3>
                </div>
                <p className="dlg-result-terms">{deal}</p>
                <p className="dlg-result-honest">
                  Pending both humans — nothing's been sent. Approve your side and you'll get the
                  summary to send to {themLabel} yourself.
                </p>
                <DebriefSection
                  debrief={debrief}
                  events={events}
                  themLabel={themLabel}
                  onRetry={() => startDebrief(events, deal)}
                />
                <div className="dlg-result-actions">
                  <HoldButton
                    label="Hold to approve your side"
                    onConfirm={() => {
                      setApproved(true);
                      // Best-effort copy — clipboard access is unavailable in some contexts. Only
                      // claim it landed if the write actually resolves; otherwise the approved view
                      // shows the summary inline so it's never lost.
                      void navigator.clipboard
                        ?.writeText(`Proposed deal with ${counterpart}: ${deal}`)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false));
                    }}
                  />
                  <button type="button" className="dlg-pass" onClick={onClose}>
                    Not yet
                  </button>
                </div>
              </div>
            )}

            {stage === 'done' && deal && approved && (
              <div className="dlg-result approved">
                <div className="dlg-result-head">
                  <span className="dlg-result-mark">
                    <CheckIcon />
                  </span>
                  <h3>Approved on your side</h3>
                </div>
                <p className="dlg-result-terms">{deal}</p>
                <p className="dlg-result-honest">
                  {copied
                    ? `The summary's on your clipboard. ${themLabel} still has to say yes for real — you send it.`
                    : `${themLabel} still has to say yes for real — copy the summary above and send it yourself.`}
                </p>
                <DebriefSection
                  debrief={debrief}
                  events={events}
                  themLabel={themLabel}
                  onRetry={() => startDebrief(events, deal)}
                />
                <button type="button" className="dlg-done" onClick={onClose}>
                  Done
                </button>
              </div>
            )}

            {stage === 'done' && !deal && (
              <div className="dlg-result nodeal">
                <div className="dlg-result-head">
                  <span className="dlg-result-mark line" aria-hidden="true" />
                  <h3>
                    {stopped
                      ? 'Stopped'
                      : boundaryHit
                        ? 'No deal — your line held'
                        : 'No deal this run'}
                  </h3>
                </div>
                <p className="dlg-result-honest">
                  {stopped
                    ? 'You called it off — nothing was sent.'
                    : boundaryHit
                      ? 'Mavéa pulled back every offer that crossed your line, and the sides couldn’t meet without it. Nothing was sent — that’s the point of scouting. Here’s where your case got tested.'
                      : `The two sides couldn’t meet in ${turns} turn${turns === 1 ? '' : 's'}. Nothing was sent — that’s the point of scouting. Here’s where your case got tested.`}
                </p>
                {stopped && turns >= 2 && debrief === 'idle' ? (
                  <button
                    type="button"
                    className="dlg-followup-btn"
                    onClick={() => startDebrief(events, deal)}
                  >
                    Debrief what happened
                  </button>
                ) : (
                  <DebriefSection
                    debrief={debrief}
                    events={events}
                    themLabel={themLabel}
                    onRetry={() => startDebrief(events, deal)}
                  />
                )}
                <button type="button" className="dlg-done" onClick={onClose}>
                  Close
                </button>
              </div>
            )}

            {stage === 'done' && (
              <div className="dlg-followup">
                {onPrepTurn && (
                  <>
                    <button
                      type="button"
                      className="dlg-followup-btn"
                      onClick={handleBringIntoConversation}
                    >
                      Bring this into the conversation
                    </button>
                    <span className="dlg-followup-hint">
                      Runs one normal answer in Live, grounded in this transcript.
                    </span>
                  </>
                )}
                <div className="dlg-followup-actions">
                  <button
                    type="button"
                    className="dlg-followup-btn ghost"
                    onClick={() => setStage('brief')}
                  >
                    Adjust the brief
                  </button>
                  <button type="button" className="dlg-followup-btn ghost" onClick={begin}>
                    Run it again
                  </button>
                </div>
              </div>
            )}

            {stage === 'done' && runs.length >= 2 && (
              <div className="dlg-runs" aria-label="Runs this session">
                {runs.map((r) => (
                  <span key={r.n} className="dlg-runs-item">
                    {`Run ${r.n} — ${
                      r.outcome === 'deal'
                        ? 'deal'
                        : r.outcome === 'stopped'
                          ? 'stopped'
                          : 'no deal'
                    } · ${r.turns} turn${r.turns === 1 ? '' : 's'}${r.deal ? ` · ${r.deal}` : ''}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
