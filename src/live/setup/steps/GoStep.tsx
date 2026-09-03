// GoStep.tsx — step 4: the hub. A glanceable checklist of your setup (each row a shortcut back
// into the step that owns it), the big "Start talking", and a quiet reset. On the right, starter
// prompts. This is what a returning user lands on directly.
import { type ReactElement, type ReactNode } from 'react';
import { hasModelConfigured, useLiveConfig } from '../../useLiveConfig';
import { providerInfo } from '../../providers';
import { useMemory } from '../../memory/useMemory';
import {
  findPreset,
  DEFAULT_MAVEA_VOICE_ID,
  VOICE_MAVEA_STORAGE_KEY,
} from '../../../voice/presets';
import { Icon } from '../../../icons/icons';
import { StarterChips } from '../../welcome/StarterChips';
import type { StepId } from '../steps';
import { useKokoroAvailable } from '../../voiceAvailability';
import { FeatureUseNotice } from '../../../legal/FeatureUseNotice';

function storedVoice(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function voiceName(key: string, fallback: string): string {
  return findPreset(storedVoice(key, fallback))?.label ?? 'Voice';
}

const QUALITY_NOTE: Record<string, string> = {
  fast: 'Fast — snappy & cheap',
  balanced: 'Balanced — the default',
  thorough: 'Thorough — deeper thinking',
};

export function GoStep({
  onJump,
  onStart,
  onStartTalking,
  onStartOver,
  onSeeHow,
  studySlot,
  librarySlot,
  launcherSlot,
}: {
  onJump: (id: StepId) => void;
  onStart: (text: string) => void;
  onStartTalking: () => void;
  onStartOver: () => void;
  onSeeHow?: () => void;
  studySlot?: ReactNode;
  librarySlot?: ReactNode;
  launcherSlot?: ReactNode;
}): ReactElement {
  const [cfg] = useLiveConfig();
  const facts = useMemory();
  // Honest voice row: Kokoro is the only voice — when its service is down, nothing speaks.
  const kokoroOk = useKokoroAvailable();
  const info = providerInfo(cfg.provider);
  const model = cfg.models[cfg.provider] || info.defaultModel;
  const company = info.label.split(' · ')[1] ?? (info.needsKey ? info.label : 'Local');
  // A key that never got entered (skipped past Connect, or since cleared) would otherwise make
  // "Start talking" a dead click — the turn fails the instant it reaches the model. Gate on it and
  // send the honest version to Connect instead of pretending everything's ready.
  const configured = hasModelConfigured(cfg);

  const searchValue = cfg.searchMode === 'off' ? 'Off' : 'Real-time';
  const memoryValue = cfg.memoryEnabled
    ? `${facts.length} ${facts.length === 1 ? 'concept' : 'concepts'} · this device only`
    : 'Off';

  // A gateway ships no default model (the user pastes their own), so an unfilled field would
  // otherwise render as a bare " · OpenRouter" — a checked row naming nothing.
  const modelValue = configured
    ? `${model} · ${company}`
    : model
      ? `${model} · ${company} — needs a key`
      : `No model set · ${company}`;

  const rows: { key: string; label: string; value: string; step: StepId; done: boolean }[] = [
    { key: 'model', label: 'Model', value: modelValue, step: 'connect', done: configured },
    { key: 'search', label: 'Web search', value: searchValue, step: 'think', done: true },
    {
      key: 'quality',
      // Same name the wizard's Think step and Settings give this dial — a checklist that renames
      // it is a third name for one control.
      label: 'Thinking time',
      value: QUALITY_NOTE[cfg.quality] ?? cfg.quality,
      step: 'think',
      done: true,
    },
    { key: 'memory', label: 'Memory', value: memoryValue, step: 'remember', done: true },
    {
      key: 'voice',
      label: 'Voice',
      value:
        kokoroOk === false
          ? 'Off — captions only (voice needs the local TTS service)'
          : voiceName(VOICE_MAVEA_STORAGE_KEY, DEFAULT_MAVEA_VOICE_ID),
      step: 'remember',
      done: true,
    },
  ];

  return (
    <div className="step-body go-grid">
      <div className="go-left">
        <ul className="checklist">
          {rows.map((r) => (
            <li key={r.key}>
              <button type="button" className="check-row" onClick={() => onJump(r.step)}>
                {/* A tick is a claim that this is settled. Ticking Model while the turn it
                    promises cannot run put a ✓ and the gated "Connect a model to start" in the
                    same card, inches apart. */}
                <span className={'check-mark' + (r.done ? '' : ' check-mark--todo')} aria-hidden>
                  {r.done ? <Icon.check /> : <Icon.alert />}
                </span>
                <span className="check-label">{r.label}</span>
                <span className="check-value">{r.value}</span>
              </button>
            </li>
          ))}
        </ul>

        {configured ? (
          <>
            <FeatureUseNotice kind="voice-data" from="live" className="go-voice-notice" />
            <button type="button" className="go-start" onClick={onStartTalking}>
              <Icon.mic /> Start talking
            </button>
          </>
        ) : (
          <button
            type="button"
            className="go-start go-start--gated"
            onClick={() => onJump('connect')}
            title="Add a model and a key on the Connect step first"
          >
            <Icon.mic /> Connect a model to start
          </button>
        )}

        <div className="go-ghosts">
          <button type="button" className="ghost-btn" onClick={onStartOver}>
            Start over
          </button>
        </div>
      </div>

      <div className="go-right">
        <div className="try-head">
          <span className="card-eyebrow">Or start with one</span>
          {onSeeHow && (
            <button type="button" className="link-btn" onClick={onSeeHow}>
              See how it works
            </button>
          )}
        </div>
        <StarterChips onStart={onStart} />
      </div>

      {/* Ways to BEGIN, before ways to resume: on a fresh device the study shelf and the library
          are both empty, and this is the only thing on the hub that says what Mavéa can do. */}
      {launcherSlot}
      {studySlot}
      {librarySlot && <div className="go-library">{librarySlot}</div>}
    </div>
  );
}
