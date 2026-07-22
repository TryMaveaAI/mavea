// The Rehearsal — practice the conversation you're dreading, against the other side.
// Setup names the conversation and who Mavéa plays, grounded only in what you type (plus
// memory facts you opt in). Then takes: you say your line, the counterpart answers in
// character (and out loud), and between takes a coach card tells you what improved and
// the one thing to change. After the real conversation, Debrief hands you back to Live.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { cancelSpeech } from '../../voice/tts';
import { forDisplay } from '../../lib/spokenText';
import { useFocusTrap } from '../useFocusTrap';
import type { ModelConfig } from '../providers/types';
import type { MemoryNode } from '../memory/store';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import {
  counterpartReply,
  coachTake,
  debriefAsk,
  type CoachCard,
  type RehearsalSetup,
  type TakeLine,
} from './engine';
import './rehearsal.css';

export function RehearsalPanel({
  cfg,
  memoryNodes,
  speak,
  onDebrief,
  onClose,
}: {
  cfg: ModelConfig;
  memoryNodes: MemoryNode[];
  speak?: (text: string) => void;
  onDebrief: (ask: string) => void;
  onClose: () => void;
}): ReactElement {
  const [scenario, setScenario] = useState('');
  const [counterpart, setCounterpart] = useState('');
  const [context, setContext] = useState('');
  const [useMemory, setUseMemory] = useState(false);
  const [step, setStep] = useState<'setup' | 'take'>('setup');

  const [take, setTake] = useState(1);
  const [lines, setLines] = useState<TakeLine[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'reply' | 'coach' | null>(null);
  const [failed, setFailed] = useState(false);
  const [coach, setCoach] = useState<CoachCard | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef);
  const prevNote = useRef<string | null>(null);

  // One in-flight side-channel call at a time; closing the panel aborts it.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      cancelSpeech();
    },
    [],
  );

  const setup = useMemo((): RehearsalSetup => {
    const remembered = useMemory ? memoryNodes.map((n) => n.body).join('. ') : '';
    return {
      scenario: scenario.trim(),
      counterpart: counterpart.trim(),
      context: [context.trim(), remembered].filter(Boolean).join('\n'),
    };
  }, [scenario, counterpart, context, useMemory, memoryNodes]);

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
      // Keep the counterpart's ordinary spelling in the transcript while handing the raw twin to
      // TTS, which resolves [[shown|said]] to the native-oriented spoken side.
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
    const card = await coachTake(setup, lines, take, prevNote.current, cfg, ac.signal);
    if (ac.signal.aborted) return;
    setBusy(null);
    setCoach(card);
    if (card) prevNote.current = card.note;
    setTake((t) => t + 1);
    setLines([]);
  }, [busy, setup, lines, take, cfg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ready = setup.scenario.length > 0 && setup.counterpart.length > 0;

  return (
    <div
      className="reh-scrim"
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label="Close the rehearsal"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClose();
      }}
    >
      {/* Clicks inside the panel are swallowed so they don't bubble to the scrim above and close
          the dialog — a propagation guard, not a click affordance, so it has no keyboard twin. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <section
        className="reh-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="The Rehearsal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="reh-head">
          <h2 className="reh-title">The Rehearsal</h2>
          {step === 'take' && (
            <span className="reh-take-badge">
              {setup.scenario} · take {take}
            </span>
          )}
          <button
            type="button"
            className="reh-close"
            onClick={onClose}
            aria-label="Close the rehearsal"
          >
            ✕
          </button>
        </header>

        {step === 'setup' ? (
          <div className="reh-setup">
            <p className="reh-lead">
              Practice the conversation that scares you — against the other side, played only from
              what you share here.
            </p>
            <FeatureUseNotice kind="simulation" from="live" />
            <label className="reh-field">
              <span>The conversation</span>
              <input
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="asking my manager for the raise"
              />
            </label>
            <label className="reh-field">
              <span>Mavéa plays</span>
              <input
                value={counterpart}
                onChange={(e) => setCounterpart(e.target.value)}
                placeholder="my manager"
              />
            </label>
            <label className="reh-field">
              <span>
                What should they know? (how this person talks, their constraints, history)
              </span>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
                placeholder="She defers to budget freezes. Our last 1:1 she said scope would be 'recognized eventually'…"
              />
            </label>
            {memoryNodes.length > 0 && (
              <label className="reh-memory">
                <input
                  type="checkbox"
                  checked={useMemory}
                  onChange={(e) => setUseMemory(e.target.checked)}
                />
                Also ground them in what Mavéa remembers ({memoryNodes.length}{' '}
                {memoryNodes.length === 1 ? 'concept' : 'concepts'})
              </label>
            )}
            <p className="reh-honest">
              They'll only know what's above — where it runs out, they play the role straight
              instead of pretending to know the real person.
            </p>
            <button
              type="button"
              className="reh-start"
              disabled={!ready}
              onClick={() => setStep('take')}
            >
              Start take 1
            </button>
          </div>
        ) : (
          <div className="reh-take">
            <ul className="reh-lines">
              {lines.map((l, i) => (
                <li key={i} className={'reh-line ' + l.who}>
                  <span className="reh-line-who">
                    {l.who === 'you' ? 'You' : setup.counterpart}
                  </span>
                  <span className="reh-line-text">{l.text}</span>
                </li>
              ))}
              {busy === 'reply' && (
                <li className="reh-thinking">{setup.counterpart} is thinking…</li>
              )}
              {failed && (
                <li className="reh-failed">
                  They didn't respond.{' '}
                  <button type="button" onClick={() => void requestReply(lines)}>
                    Try again
                  </button>
                </li>
              )}
            </ul>

            {coach && (
              <aside className="reh-coach" aria-label="Coach, between takes">
                <span className="reh-coach-kicker">COACH — BETWEEN TAKES</span>
                <p className="reh-coach-note">{coach.note}</p>
                <p className="reh-coach-tip">{coach.tip}</p>
              </aside>
            )}
            {busy === 'coach' && <p className="reh-thinking">Coach is watching the take back…</p>}

            <div className="reh-compose">
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
                className="reh-say"
                disabled={!draft.trim() || busy !== null}
                onClick={sayLine}
              >
                Say it
              </button>
            </div>

            <footer className="reh-actions">
              <button
                type="button"
                className="reh-end"
                disabled={busy !== null || !lines.some((l) => l.who === 'you')}
                onClick={() => void endTake()}
              >
                End take · get coached
              </button>
              <button
                type="button"
                className="reh-debrief"
                onClick={() => onDebrief(debriefAsk(setup))}
                title="Had the real conversation? Tell Mavéa how it went."
              >
                Debrief the real one
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
