// SetupWizard.tsx — the Live onboarding surface. First time, it's a calm four-step ritual
// (Connect → Think → Remember → Go); on the last step the orb warms and Mavéa says "I'm awake."
// once. Every time after, setup persists on this device, so it opens straight on the Go hub with
// a "What are we figuring out?" hub — no wizard, no audio. The constellation discs and checklist
// rows are free-navigation shortcuts; editing any step just saves as you go and "Done" returns
// to the hub. The orb itself is owned by LiveApp (the shared presence layer); this only signals
// calm-vs-woken to it via a root data attribute, never touching the byte-locked face.
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../../icons/icons';
import { resetLiveConfig } from '../useLiveConfig';
import { clearSession } from '../session/store';
import { welcomeBackLine } from '../../lib/greeting';
import { isSetupDone, markSetupDone, resetSetup } from './setup';
import {
  STEPS,
  stepMeta,
  nextStep,
  GO_FIRST_RUN_TITLE,
  GO_FIRST_RUN_SUB,
  type StepId,
} from './steps';
import { Constellation } from './Constellation';
import { TemplatePicker } from '../TemplatePicker';
import { ConnectStep } from './steps/ConnectStep';
import { ThinkStep } from './steps/ThinkStep';
import { RememberStep } from './steps/RememberStep';
import { GoStep } from './steps/GoStep';

export function SetupWizard({
  speak,
  goDemo,
  onStart,
  onStartTalking,
  onSeeHow,
  studySlot,
  librarySlot,
  launcherSlot,
  paletteSlot,
  seed,
}: {
  speak: (text: string) => void;
  goDemo: () => void;
  onStart: (text: string) => void;
  onStartTalking: () => void;
  onSeeHow?: () => void;
  studySlot?: ReactNode;
  librarySlot?: ReactNode;
  /** The "ways to begin" launcher — the Go hub's front door to the capabilities the wizard's
   *  hidden topbar and dock would otherwise put out of reach until after the first question. */
  launcherSlot?: ReactNode;
  /** The ⌘K palette handle. The app topbar that normally carries it is hidden here (it would sit
   *  as an opaque, click-blocking layer over the constellation — see setup-wizard.css), so the
   *  shortcut worked in the wizard with nothing on screen saying it existed. */
  paletteSlot?: ReactNode;
  /** A question handed over from the landing — prefills the Go composer so it's ready post-setup. */
  seed?: string;
}): ReactElement {
  // Snapshot "is this a first-run session" ONCE: marking setup done mid-session (on first arrival
  // at Go) must not retroactively turn this into a returning visit for the rest of the session.
  const firstRun = useRef(!isSetupDone());
  const spoken = useRef(false);
  const [step, setStep] = useState<StepId>(firstRun.current ? 'connect' : 'go');
  const [editingReturn, setEditingReturn] = useState(false);
  const [typed, setTyped] = useState('');
  // The landing's question survives the ritual here (navigating to a non-Go step clears `typed`),
  // then drops into the Go composer the moment the user lands on the hub. Consumed once.
  const pendingSeed = useRef(seed ?? '');
  // Becomes true once the ritual is finished (Go reached on a first run) — from then on the
  // constellation shows every step as configured, like a returning user's.
  const [reachedGo, setReachedGo] = useState(!firstRun.current);

  const setupComplete = !firstRun.current || reachedGo;

  // The friend's spoken hello on arrival at Go, exactly once per session. A first run says
  // "I'm awake."; a returning visit gets a warm, lightly-inviting greeting so Mavéa feels present
  // and nudges you to talk, instead of sitting silent. speak() is mute-gated, and browser autoplay
  // only lets it through after the user's navigation gesture (the common demo→Live click), so it
  // stays unobtrusive — a hard reload just lands on the already-warm orb with no audio. No
  // timers/listeners here, so there's nothing to tear down.
  useEffect(() => {
    if (step !== 'go') return;
    setReachedGo(true);
    if (firstRun.current) markSetupDone();
    // A question handed over from the landing rides through the ritual to here. The moment the
    // user finishes setup and lands on Go, forward it as their first turn — they don't re-ask,
    // and we skip the spoken greeting since a real turn (with its own narration) is about to run.
    const seeded = pendingSeed.current;
    if (seeded) {
      pendingSeed.current = '';
      onStart(seeded);
      return;
    }
    if (spoken.current) return;
    spoken.current = true;
    speak(firstRun.current ? 'I’m awake.' : welcomeBackLine(new Date().getHours()));
  }, [step, speak, onStart]);

  // Stamp the current step so CSS can hide the orb through the ritual and reveal + position the
  // resting aurora face on the Go hub. No colour re-tint — the face keeps its natural palette.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.wizardStep = step;
    return () => {
      delete root.dataset.wizardStep;
    };
  }, [step]);

  // The woken face rests above the Go hub, but the hub scrolls (a long "pick up where you left off"
  // list) and the face is a fixed overlay — so without this it would float over the cards as you
  // scroll. Publish scroll progress (0→1 over the first ~130px) into `--wiz-scroll`; CSS fades the
  // face out as you dive in, so it's only present at the top rest position and never covers text.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const root = document.documentElement;
    let raf = 0;
    const sync = (): void => {
      raf = 0;
      root.style.setProperty('--wiz-scroll', String(Math.min(1, el.scrollTop / 130)));
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    sync();
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty('--wiz-scroll');
    };
  }, [step]);

  const go = (id: StepId): void => {
    setEditingReturn(setupComplete && id !== 'go');
    setStep(id);
    if (id !== 'go') setTyped('');
  };

  const done = (): void => {
    go(editingReturn ? 'go' : (nextStep(step) ?? 'go'));
  };

  const startOver = (): void => {
    const sure =
      typeof window === 'undefined' ||
      window.confirm('Start over? This clears your saved setup and replays the intro.');
    if (!sure) return;
    resetLiveConfig();
    resetSetup();
    clearSession(); // a replayed intro must not be followed by a restored old conversation
    firstRun.current = true;
    spoken.current = false;
    setReachedGo(false);
    setEditingReturn(false);
    setStep('connect');
  };

  // Constellation checks: while still walking the ritual, only steps behind you; once set up,
  // every step except the one you're on.
  const currentIndex = STEPS.findIndex((s) => s.id === step);
  const doneSet = new Set<StepId>(
    STEPS.filter((s, i) => (setupComplete ? s.id !== step : i < currentIndex)).map((s) => s.id),
  );

  const meta = stepMeta(step);
  const onGo = step === 'go';
  const title = onGo && firstRun.current ? GO_FIRST_RUN_TITLE : meta.title;
  const sub = onGo && firstRun.current ? GO_FIRST_RUN_SUB : meta.sub;

  return (
    <div className="setup stage" data-active="1">
      <header className="setup-nav">
        <button type="button" className="setup-back" onClick={goDemo}>
          <span aria-hidden>←</span> Back to the demo
        </button>
        <Constellation current={step} done={doneSet} onPick={go} />
        {/* One right flank, not two children: the nav is a 1fr-auto-1fr grid that puts the
            constellation on the true page centre-line, so a second element out here became a
            fourth grid item and wrapped onto its own row — which is what dropped the appearance
            toggle below the constellation on a phone. */}
        <div className="setup-nav-end">
          {paletteSlot}
          <TemplatePicker triggerClassName="setup-icon-btn" />
        </div>
      </header>

      <div className="setup-stage" ref={stageRef}>
        <div className="setup-head">
          <h1 className="setup-q">{title}</h1>
          <p className="setup-sub">{sub}</p>
        </div>

        <section
          key={step}
          className={'card reveal setup-card' + (onGo ? ' setup-card--wide' : '')}
          aria-label={meta.label}
        >
          {step === 'connect' && <ConnectStep />}
          {step === 'think' && <ThinkStep />}
          {step === 'remember' && <RememberStep />}
          {onGo && (
            <GoStep
              onJump={go}
              onStart={onStart}
              onStartTalking={onStartTalking}
              onStartOver={startOver}
              onSeeHow={onSeeHow}
              studySlot={studySlot}
              librarySlot={librarySlot}
              launcherSlot={launcherSlot}
            />
          )}

          {!onGo && (
            <footer className="setup-foot">
              <span className="setup-foot-note">Changes save as you make them.</span>
              <button type="button" className="setup-done" onClick={done}>
                Done <Icon.check />
              </button>
            </footer>
          )}
        </section>
      </div>

      {onGo && (
        <div className="go-composer">
          <div className="go-composer-inner">
            <input
              className="go-composer-input"
              type="text"
              placeholder="Say it or type it. Try ‘plan a trip’ or ‘compare two options’…"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                // See CommandComposer: an IME's Enter commits a candidate, it doesn't send.
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && typed.trim()) {
                  onStart(typed.trim());
                }
              }}
            />
            {typed.trim() ? (
              <button
                type="button"
                className="go-composer-send"
                aria-label="Send"
                onClick={() => onStart(typed.trim())}
              >
                <Icon.send />
              </button>
            ) : (
              <button
                type="button"
                className="go-composer-mic"
                aria-label="Use microphone"
                onClick={onStartTalking}
              >
                <Icon.mic />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
