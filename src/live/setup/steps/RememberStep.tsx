// RememberStep.tsx — step 3: memory & voice. Toggle whether Mavéa keeps durable facts (and prune
// them here), and choose Mavéa's own voice. Reuses the existing memory store, voice presets, and
// preview path; nothing new persists.
import { useState, type ReactElement } from 'react';
import { useLiveConfig, setLiveConfigV2 } from '../../useLiveConfig';
import { useMemory } from '../../memory/useMemory';
import { deleteNode, forgetAll } from '../../memory/store';
import {
  VOICE_PRESETS,
  findPreset,
  DEFAULT_MAVEA_VOICE_ID,
  VOICE_MAVEA_STORAGE_KEY,
} from '../../../voice/presets';
import { setKokoroVoice } from '../../../voice/kokoro';
import { previewVoice } from '../../../voice/preview';
import { Icon } from '../../../icons/icons';
import { ToggleRow } from '../controls';
import { DropSelect } from '../DropSelect';
import { VoiceOffHint } from '../../VoiceOffHint';

function storedVoice(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function applyVoice(id: string): void {
  const p = findPreset(id);
  if (!p) return;
  setKokoroVoice('mavea', p.kokoro);
  try {
    localStorage.setItem(VOICE_MAVEA_STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

function VoicePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
}): ReactElement {
  return (
    <div className="voice-col">
      <span className="card-eyebrow">{label}</span>
      <div className="voice-row">
        <DropSelect
          ariaLabel={label}
          value={value}
          onChange={(id) => {
            onChange(id);
            applyVoice(id);
            const p = findPreset(id);
            if (p) previewVoice(p);
          }}
          options={VOICE_PRESETS.map((p) => ({ value: p.id, label: p.label, note: p.tone }))}
        />
        <button
          type="button"
          className="voice-play"
          onClick={() => {
            const p = findPreset(value);
            if (p) previewVoice(p);
          }}
          aria-label="Preview Mavéa's voice"
          title="Preview voice"
        >
          <Icon.play />
        </button>
      </div>
    </div>
  );
}

export function RememberStep(): ReactElement {
  const [cfg] = useLiveConfig();
  const facts = useMemory();
  const [maveaVoice, setMaveaVoice] = useState(() =>
    storedVoice(VOICE_MAVEA_STORAGE_KEY, DEFAULT_MAVEA_VOICE_ID),
  );

  return (
    <div className="step-body">
      <ToggleRow
        label="Remember me"
        on={cfg.memoryEnabled}
        onToggle={() => setLiveConfigV2({ memoryEnabled: !cfg.memoryEnabled })}
        note="Durable facts about you, kept on this device only, to personalize future chats."
      />

      {cfg.memoryEnabled && (
        <div className="memory-panel">
          <div className="memory-head">
            <span className="card-eyebrow">
              What Mavéa remembers ({facts.length} {facts.length === 1 ? 'concept' : 'concepts'})
            </span>
            {facts.length > 0 && (
              <button type="button" className="ghost-btn" onClick={() => forgetAll()}>
                Forget all
              </button>
            )}
          </div>
          {facts.length === 0 ? (
            <p className="memory-empty">Nothing yet — Mavéa will note useful facts as you talk.</p>
          ) : (
            <ul className="memory-list">
              {facts.map((n) => (
                <li key={n.id} className="memory-fact">
                  <span className="memory-fact-concept">{n.concept}</span>
                  <span className="memory-fact-text">{n.body}</span>
                  <button
                    type="button"
                    className="memory-x"
                    onClick={() => deleteNode(n.id)}
                    aria-label={`Forget: ${n.concept}`}
                    title="Forget this"
                  >
                    <Icon.x />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <hr className="setup-divider" />

      <div className="voice-grid">
        <VoicePicker label="Mavéa speaks as" value={maveaVoice} onChange={setMaveaVoice} />
      </div>
      <VoiceOffHint />
    </div>
  );
}
