// The Rehearsal's take-the-seat stage — you sit in your own chair and say your lines; the
// counterpart answers in character (and out loud), played only from the brief. Between takes
// a coach card says what improved and the one thing to change; after the real conversation,
// "Debrief the real one" hands you back to Live. The other seat keeps its ghost jelly — the
// same table as the two-agent run, with you in the seat your Mavéa usually takes.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import { Presence } from '../../presence/Presence';
import { cancelSpeech } from '../../voice/tts';
import { forDisplay } from '../../lib/spokenText';
import type { ModelConfig } from '../providers/types';
import { tableLook, SAY_MS, type TablePhase } from './tableLook';
import {
  counterpartReply,
  coachTake,
  debriefAsk,
  type CoachCard,
  type RehearsalSetup,
  type TakeLine,
} from './rehearse';

export function TakeSeatStage({
  setup,
  themLabel,
  cfg,
  speak,
  onDebrief,
  onAdjustBrief,
}: {
  setup: RehearsalSetup;
  themLabel: string;
  cfg: ModelConfig;
  /** Speak the counterpart's raw reply — the [[shown|said]] twin resolves in TTS. */
  speak?: (text: string) => void;
  /** Stage `debriefAsk` in the Live composer — omit to hide the action. */
  onDebrief?: (ask: string) => void;
  onAdjustBrief: () => void;
}): ReactElement {
  const [take, setTake] = useState(1);
  const [lines, setLines] = useState<TakeLine[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'reply' | 'coach' | null>(null);
  const [failed, setFailed] = useState(false);
  const [coachFailed, setCoachFailed] = useState(false);
  const [coach, setCoach] = useState<CoachCard | null>(null);
  const prevNote = useRef<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  // One in-flight side-channel call at a time; leaving the stage aborts it and the voice.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      cancelSpeech();
    },
    [],
  );

  // Keep the newest line in view as the take grows — the log scrolls in its own pane,
  // exactly like the negotiation exchange.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, busy]);

  // The landed-line beat: hold the counterpart's talking look for a moment after their line
  // arrives, then let tableLook settle them back to listening. (The two-agent run times this
  // in useSpeakBeat; a take only ever lands "their" lines, so the beat is this one timer.)
  const [justSpoke, setJustSpoke] = useState(false);
  const seenRef = useRef(0);
  useEffect(() => {
    if (lines.length === seenRef.current) return;
    seenRef.current = lines.length;
    if (lines[lines.length - 1]?.who !== 'them') {
      setJustSpoke(false);
      return;
    }
    setJustSpoke(true);
    const t = window.setTimeout(() => setJustSpoke(false), SAY_MS);
    return () => window.clearTimeout(t);
  }, [lines]);

  const phase: TablePhase = {
    kind: 'running',
    whoseTurn: busy === 'reply' ? 'theirs' : 'yours',
    guarded: false,
    speaking: justSpoke ? { side: 'theirs', offer: false, pointing: false } : null,
  };
  const look = tableLook(phase);

  const requestReply = useCallback(
    async (allLines: TakeLine[]) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy('reply');
      setFailed(false);
      const reply = await counterpartReply(setup, allLines, cfg, ac.signal);
      if (ac.signal.aborted) return;
      setBusy(null);
      if (!reply) {
        setFailed(true);
        return;
      }
      // Keep the counterpart's ordinary spelling in the transcript while handing the raw twin
      // to TTS, which resolves [[shown|said]] to the native-oriented spoken side.
      setLines([...allLines, { who: 'them', text: forDisplay(reply) }]);
      speak?.(reply);
    },
    [setup, cfg, speak],
  );

  const sayLine = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setCoach(null);
    setCoachFailed(false);
    const next: TakeLine[] = [...lines, { who: 'you', text }];
    setLines(next);
    void requestReply(next);
  }, [draft, busy, lines, requestReply]);

  const endTake = useCallback(async () => {
    if (busy) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy('coach');
    setCoachFailed(false);
    const card = await coachTake(setup, lines, take, prevNote.current, cfg, ac.signal);
    if (ac.signal.aborted) return;
    setBusy(null);
    // No card means the coach call failed. Ending the take here anyway would wipe the take the
    // user just performed and show nothing in its place — the work is gone with no way back. Keep
    // the lines and the take number exactly as they are and offer the retry instead.
    if (!card) {
      setCoachFailed(true);
      return;
    }
    setCoach(card);
    prevNote.current = card.note;
    setTake((t) => t + 1);
    setLines([]);
  }, [busy, setup, lines, take, cfg]);

  const chip = (who: TakeLine['who']): ReactElement => (
    <span className={`dlg-side ${who === 'you' ? 'yours' : 'theirs'}`}>
      <span className="dlg-avatar" aria-hidden="true" />
      <span className="dlg-side-text">
        <span className="dlg-side-name">{who === 'you' ? 'You' : themLabel}</span>
      </span>
    </span>
  );

  return (
    <div className="dlg-table" data-seat="you">
      {/* Same disclosure as the two-agent table: the counterpart is a simulation built only
          from the user's own notes, and its lines must never read as the real person's. */}
      <FeatureUseNotice kind="simulation" from="live" />
      <div className="dlg-tablescape">
        <div className="dlg-seat yours">
          <span className="dlg-seat-you" aria-hidden="true" />
          <span className="dlg-seat-name">You</span>
        </div>
        <div className="dlg-meta">
          <span className="dlg-take-badge">Take {take}</span>
        </div>
        <div className="dlg-seat theirs">
          <span className="dlg-jelly ghost" aria-hidden="true">
            <Presence {...look.theirs} />
          </span>
          <span className="dlg-seat-name">{themLabel}</span>
          <span className="dlg-seat-tag">in character</span>
        </div>
      </div>

      <ol className="dlg-log" ref={logRef} role="log" aria-live="polite" aria-label="The take">
        {lines.map((l, i) => (
          <li key={i} className={`dlg-turn ${l.who === 'you' ? 'yours' : 'theirs'}`}>
            {chip(l.who)}
            <p className="dlg-turn-say">{l.text}</p>
          </li>
        ))}
        {busy === 'reply' && (
          <li className="dlg-turn theirs thinking" aria-hidden="true">
            {chip('them')}
            <span className="dlg-typing">
              <i />
              <i />
              <i />
            </span>
          </li>
        )}
        {failed && (
          <li className="dlg-failed">
            They didn't respond.{' '}
            <button type="button" onClick={() => void requestReply(lines)}>
              Try again
            </button>
          </li>
        )}
      </ol>

      {coach && (
        <aside className="dlg-coach" aria-label="Coach, between takes">
          <span className="dlg-coach-kicker">COACH — BETWEEN TAKES</span>
          <p className="dlg-coach-note">{coach.note}</p>
          <p className="dlg-coach-tip">{coach.tip}</p>
        </aside>
      )}
      {busy === 'coach' && <p className="dlg-coach-wait">Coach is watching the take back…</p>}
      {coachFailed && (
        <p className="dlg-failed" role="status">
          The coach didn&rsquo;t respond — your take is still here.{' '}
          <button type="button" onClick={() => void endTake()}>
            Try again
          </button>
        </p>
      )}

      <div className="dlg-compose">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sayLine();
          }}
          placeholder={
            lines.length === 0 ? 'Open the conversation — your first line' : 'Your next line'
          }
          aria-label="Your line"
        />
        <button
          type="button"
          className="dlg-say"
          disabled={!draft.trim() || busy !== null}
          onClick={sayLine}
        >
          Say it
        </button>
      </div>

      <div className="dlg-take-actions">
        <button
          type="button"
          className="dlg-end-take"
          disabled={busy !== null || !lines.some((l) => l.who === 'you')}
          onClick={() => void endTake()}
        >
          End take · get coached
        </button>
        <button type="button" className="dlg-followup-btn ghost" onClick={onAdjustBrief}>
          Adjust the brief
        </button>
        {onDebrief && (
          <button
            type="button"
            className="dlg-real-debrief"
            onClick={() => onDebrief(debriefAsk(setup))}
            title="Had the real conversation? Tell Mavéa how it went."
          >
            Debrief the real one
          </button>
        )}
      </div>
    </div>
  );
}
