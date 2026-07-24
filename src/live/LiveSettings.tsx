// LiveSettings.tsx — the BYOK picker for the Live surface: choose a provider,
// model, and paste a key. Shows the live "operating point" (speed vs depth) and a readiness dot.
// Keys stay in memory unless Remember stores encrypted ciphertext on this device; requests travel
// through the deployment's same-origin proxy to the chosen provider. Styling leans on design
// tokens (works in dark + light).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { Icon } from '../icons/icons';
import { useFocusTrap } from './useFocusTrap';
import { DropSelect } from './setup/DropSelect';
import { ModelSelect } from './setup/ModelSelect';
import { ProviderResponsibilityNotice } from './setup/ProviderResponsibilityNotice';
import { FeatureUseNotice } from '../legal/FeatureUseNotice';
import { VISIBLE_PROVIDERS, providerInfo, getAdapter } from './providers';
import {
  useLiveConfig,
  setLiveConfigV2,
  setProviderField,
  getLiveConfigV2,
  toModelConfig,
  exportConfig,
  importConfig,
} from './useLiveConfig';
import { useMemory } from './memory/useMemory';
import { useLibrary } from './library/useLibrary';
import { clearLibrary } from './library/store';
import { forgetAll } from './memory/store';
import { MemoryFactRow } from './memory/MemoryFactRow';
import { groupedNodes, namespaceLabel } from './memory/groups';
import { downloadOKFBundle } from './memory/export';
import { formatAgo } from './library/time';
import { quietHoursEnabled, setQuietHoursEnabled } from './whisper/quietHours';
import {
  VOICE_PRESETS,
  findPreset,
  DEFAULT_MAVEA_VOICE_ID,
  VOICE_MAVEA_STORAGE_KEY,
} from '../voice/presets';
import { setKokoroVoice } from '../voice/kokoro';
import { cancelSpeech, setVoiceMode, voiceMode, type VoiceMode } from '../voice/tts';
import { previewVoice } from '../voice/preview';
import { pttKeyLabel } from './voice/useHoldToTalk';
import {
  type PerfMode,
  readPerfMode,
  writePerfMode,
  applyPerfTier,
  resolveTierNow,
} from '../lib/perfTier';
import { VoiceOffHint } from './VoiceOffHint';
import { MemoryGraph } from './memory/MemoryGraph';
import { resetLegalAcceptance } from '../legal/acceptance';
import { legalDocumentHref } from '../legal/links';
import { AppearanceSettings } from './TemplatePicker';
import { setStudyStyle } from './srs/store';
import type { StudyStyle } from './srs/store';
import { useCardCounts, useStudyPrefs } from './srs/useStudy';

// A quiet disclosure for the long tail of options. Everything inside is real and supported —
// it just doesn't deserve to greet a first-time user at the same volume as the API key.
function AdvancedGroup({
  children,
  label = 'More options',
  defaultOpen = false,
}: {
  children: React.ReactNode;
  label?: string;
  /** Start expanded — used when a link (the palette's "Whisper mode") sends someone here for a
   *  specific setting; it shouldn't cost them a second click to find it. */
  defaultOpen?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          padding: '4px 2px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            transition: 'transform 150ms ease',
            transform: open ? 'rotate(90deg)' : 'none',
            fontSize: 10,
          }}
        >
          ▶
        </span>
        {label}
      </button>
      {open && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingLeft: 10,
            borderLeft: '2px solid var(--line)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// A small pill toggle used by the hold-to-talk key + side pickers (token-only, light/dark safe).
function pttBtnStyle(active: boolean): CSSProperties {
  return {
    padding: '5px 14px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--presence)' : 'var(--line)'}`,
    background: active
      ? 'color-mix(in oklab, var(--presence) 12%, var(--surface-elevated))'
      : 'var(--surface-default)',
    color: active ? 'var(--presence)' : 'var(--text-secondary)',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
  };
}

// Design tokens only (these adapt to light/dark); the old `var(--card/--bg/--border)`
// fallbacks were undefined, so their dark hex always won and looked wrong in light mode.
const card: CSSProperties = {
  background: 'var(--surface-elevated)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: 'min(460px, calc(100vw - 32px))',
  boxShadow: 'var(--shadow-modal)',
};
const labelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
const inputStyle: CSSProperties = {
  background: 'var(--surface-default)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '9px 11px',
  color: 'var(--text-primary)',
  font: 'inherit',
  width: '100%',
};

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

/** A labelled on/off row with a one-line note (used for the capability toggles). */
function ToggleRow({
  label,
  on,
  onToggle,
  note,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  note: string;
}): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        style={{
          flex: '0 0 auto',
          width: 38,
          height: 22,
          borderRadius: 999,
          border: '1px solid var(--line-strong)',
          background: on ? 'var(--presence)' : 'var(--track)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 140ms ease',
          marginTop: 1,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            // Match the canonical .toggle-knob: white on the saturated 'on' track, muted on the
            // faint 'off' track — otherwise a white thumb nearly vanishes on the light off-track.
            background: on ? '#fff' : 'var(--text-muted)',
            transition: 'left 140ms ease, background 140ms ease',
          }}
        />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{note}</span>
      </div>
    </div>
  );
}

/** A segmented picker (2–3 options) with an optional feature badge per option. */
function SegRow({
  value,
  options,
  onPick,
  label,
}: {
  value: string;
  options: { value: string; label: string; badge?: string }[];
  onPick: (value: string) => void;
  /** Names the group for assistive tech — a radiogroup without one is announced as anonymous. */
  label?: string;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: 'flex',
        gap: 4,
        padding: 3,
        borderRadius: 10,
        background: 'var(--track)',
        border: '1px solid var(--line)',
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              padding: '6px 8px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--surface-elevated)' : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
              color: 'inherit',
              font: 'inherit',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{o.label}</span>
            {o.badge && (
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{o.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function LiveSettings({
  onClose,
  initialTab,
  initialAdvancedYouOpen,
}: {
  onClose?: () => void;
  /** Open on a specific tab. */
  initialTab?: 'model' | 'settings' | 'you' | 'data';
  /** Start the You tab's "More options" expanded — the palette's "Whisper mode" lands straight
   *  on Quiet hours, the setting that actually controls it. */
  initialAdvancedYouOpen?: boolean;
}): ReactElement {
  const [cfg] = useLiveConfig();
  // Three surfaces can change the study style (here, the flashcards page, the first-save question),
  // so subscribe rather than snapshotting it into local state.
  const { style: studyStyle, newPerDay } = useStudyPrefs();
  const cardCounts = useCardCounts();
  const info = providerInfo(cfg.provider);
  // Raw is what's actually stored (may be empty from a deliberate clear); `model` softly falls
  // back to the provider's default for readiness checks — toModelConfig() does the same at
  // request time. The model input below must bind to `rawModel`, not `model`: binding it to the
  // defaulted value snapped the field back to the default the instant a backspace emptied it.
  const rawModel = cfg.models[cfg.provider] ?? '';
  const model = rawModel || info.defaultModel;
  const key = cfg.keys[cfg.provider] ?? '';
  const caps = getAdapter(cfg.provider).capabilities;
  const facts = useMemory();
  // The on-device size label re-serialized the whole memory store on every settings render
  // (each keystroke in the panel, every toggle). Size it once per store change instead.
  const factsKb = useMemo(
    () => Math.max(1, Math.round(JSON.stringify(facts).length / 1024)),
    [facts],
  );
  const library = useLibrary();
  const [quietHours, setQuietHours] = useState(quietHoursEnabled);
  const [memView, setMemView] = useState<'list' | 'graph'>('list');
  const [tab, setTab] = useState<'model' | 'settings' | 'you' | 'data'>(initialTab ?? 'model');
  const [legalReset, setLegalReset] = useState(false);

  const [ready, setReady] = useState<{ llm: boolean; model: boolean; statusCode?: number } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const probeSeq = useRef(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Whole-app backup (dashboards, memory, flashcards, …) — separate from the settings-only export
  // above. Its heavy machinery (every store) is lazy-imported on click so it never enters this chunk.
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  // Board-grade modal behavior, matching the other Live overlays: trap focus inside the dialog
  // and close on Escape (it previously closed only on a backdrop click — a keyboard/a11y gap).
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  function handleExport(): void {
    const json = exportConfig();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mavea-live-v2.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: { target: HTMLInputElement }): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importConfig(reader.result as string);
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Import failed.');
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be re-imported if needed.
    e.target.value = '';
  }

  async function handleBackupExport(): Promise<void> {
    setBackupError(null);
    setBackupNote(null);
    try {
      const { downloadBackup } = await import('./backup/backup');
      downloadBackup();
      setBackupNote('Backup downloaded.');
    } catch {
      setBackupError('Couldn’t build the backup — please try again.');
    }
  }

  function handleBackupImport(e: { target: HTMLInputElement }): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupError(null);
    setBackupNote(null);
    // A full backup is a few MB; anything wildly larger isn't one — reject before reading it in.
    if (file.size > 25_000_000) {
      setBackupError('That file is too large to be a Mavéa backup.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const { importBackup } = await import('./backup/backup');
          const s = importBackup(reader.result as string);
          const parts = [
            [s.dashboards, 'dashboard'],
            [s.memory, 'memory'],
            [s.flashcards, 'card'],
            [s.library, 'saved canvas', 'saved canvases'],
            [s.atlas, 'map record'],
            [s.courses, 'course'],
          ] as const;
          const merged = parts
            .filter(([n]) => n > 0)
            .map(([n, one, many]) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`);
          setBackupNote(
            merged.length ? `Merged ${merged.join(', ')}.` : 'Nothing new to merge from that file.',
          );
        } catch (err) {
          setBackupError(err instanceof Error ? err.message : 'Import failed.');
        }
      })();
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const [maveaVoice, setMaveaVoice] = useState(() =>
    storedVoice(VOICE_MAVEA_STORAGE_KEY, DEFAULT_MAVEA_VOICE_ID),
  );

  // Visual richness — a per-DEVICE setting (localStorage, not the synced LiveConfig): it's about
  // this machine's GPU, not the account. Picking a mode persists it and re-resolves + applies the
  // tier onto <html data-perf> right away, so the change is visible without a reload.
  const [voiceModeChoice, setVoiceModeChoice] = useState<VoiceMode>(() => voiceMode());
  const pickVoiceMode = useCallback((mode: VoiceMode) => {
    setVoiceModeChoice(mode);
    setVoiceMode(mode);
    // A voice already mid-line belongs to the tier the person just left; stop it so the next line
    // is spoken by the one they chose rather than finishing in the old voice.
    cancelSpeech();
  }, []);

  const [perfMode, setPerfMode] = useState<PerfMode>(() => readPerfMode());
  const pickPerfMode = useCallback((mode: PerfMode) => {
    setPerfMode(mode);
    writePerfMode(mode);
    applyPerfTier(resolveTierNow());
  }, []);

  const probe = useCallback(async () => {
    const seq = ++probeSeq.current;
    setChecking(true);
    // The readiness probe lives in the catalog-free leaf ./ready — import it directly (no longer
    // via generateLive, which would drag the turn engine + catalog into the settings chunk).
    const { checkLiveReady } = await import('./ready');
    const r = await checkLiveReady(toModelConfig(getLiveConfigV2()), { tts: false });
    if (seq === probeSeq.current) {
      setReady({ llm: r.llm, model: r.model, statusCode: r.statusCode });
      setChecking(false);
    }
  }, []);

  // Re-probe shortly after any provider/model/key change settles.
  useEffect(() => {
    const t = setTimeout(() => void probe(), 400);
    return () => clearTimeout(t);
  }, [cfg.provider, model, key, probe]);

  const dotColor = checking
    ? 'var(--text-muted)'
    : ready?.llm && ready?.model
      ? 'var(--insight)'
      : 'var(--warning)';
  const readyText = checking
    ? 'Checking…'
    : ready?.llm && ready?.model
      ? 'Ready'
      : ready?.llm
        ? 'Reachable — model not found'
        : info.needsKey && !key
          ? 'Add your API key'
          : ready?.statusCode === 401
            ? 'Invalid API key'
            : ready?.statusCode === 403
              ? 'Key lacks permission'
              : ready?.statusCode === 404
                ? 'Model not found'
                : ready?.statusCode !== undefined
                  ? `Error ${ready.statusCode}`
                  : 'Not reachable';

  return (
    <div ref={dialogRef} style={card} role="dialog" aria-modal="true" aria-label="Mavéa settings">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon.sparkle
            style={{ width: 16, height: 16, flex: '0 0 auto', color: 'var(--presence)' }}
          />
          Settings
        </span>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close settings"
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              padding: 0,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Icon.x style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      {/* Tab nav */}
      <div className="ls-tabs" role="tablist" aria-label="Settings sections">
        {(['model', 'settings', 'you', 'data'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`ls-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'model'
              ? 'Model'
              : t === 'settings'
                ? 'Settings'
                : t === 'you'
                  ? 'You'
                  : 'Your data'}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="ls-body">
        {tab === 'model' && (
          <div className="settings-model-connect">
            {/* provider chips */}
            <div
              className="settings-provider-picker"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
              aria-label="Model providers"
            >
              {VISIBLE_PROVIDERS.map((p) => {
                const active = p.id === cfg.provider;
                return (
                  <button
                    key={p.id}
                    onClick={() => setLiveConfigV2({ provider: p.id })}
                    style={{
                      ...inputStyle,
                      width: 'auto',
                      cursor: 'pointer',
                      borderColor: active ? 'var(--presence)' : 'var(--line)',
                      boxShadow: active ? '0 0 0 1px var(--presence)' : 'none',
                      opacity: active ? 1 : 0.7,
                    }}
                    aria-pressed={active}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* model */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Model</span>
              <ModelSelect
                key={cfg.provider}
                provider={cfg.provider}
                value={rawModel}
                onChange={(v) => setProviderField(cfg.provider, 'model', v)}
              />
            </div>

            {/* key (hosted only) */}
            {info.needsKey && (
              <label
                className="settings-api-key-field"
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={labelStyle}>API key</span>
                  {!cfg.rememberKey && (
                    <span className="settings-session-only" aria-label="Key is not saved to disk">
                      session only
                    </span>
                  )}
                </span>
                <input
                  style={inputStyle}
                  type="password"
                  value={key}
                  onChange={(e) => setProviderField(cfg.provider, 'key', e.target.value)}
                  placeholder={cfg.provider === 'anthropic' ? 'sk-ant-…' : 'paste your key'}
                  spellCheck={false}
                  autoComplete="off"
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Kept in memory unless Remember is on — sent through this deployment to{' '}
                  {info.label.split(' · ')[1] ?? info.label} when used.
                </span>
              </label>
            )}

            {/* operating point + readiness */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: dotColor,
                  flex: '0 0 auto',
                }}
                aria-hidden
              />
              <span>{readyText}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: 'var(--text-muted)' }}>{info.hint}</span>
              <button
                onClick={() => void probe()}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 12,
                }}
                title="Re-check readiness"
              >
                Recheck
              </button>
            </div>

            {/* remember key + export/import — bottom of model tab */}
            {info.needsKey && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={cfg.rememberKey}
                  onChange={(e) => setLiveConfigV2({ rememberKey: e.target.checked })}
                />
                <span>Remember key on this device</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {cfg.rememberKey
                    ? 'encrypted in this browser — trusted devices only'
                    : 'kept in memory only — cleared on reload'}
                </span>
              </label>
            )}
            <ProviderResponsibilityNotice />
            <div className="settings-transfer-row">
              <button type="button" className="settings-transfer-btn" onClick={handleExport}>
                Export settings
              </button>
              <button
                type="button"
                className="settings-transfer-btn"
                onClick={() => importInputRef.current?.click()}
              >
                Import settings
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                aria-hidden="true"
                onChange={handleImportFile}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                API and search keys are never included.
              </span>
              {importError && (
                <span className="settings-import-error" role="alert">
                  {importError}
                </span>
              )}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <>
            <AppearanceSettings />

            {/* Web search — Real-time is always pickable (never disabled for a non-native
            provider — that reads as broken); the helper line carries the model-dependent
            caveat instead. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Web search</span>
              <SegRow
                value={cfg.searchMode}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'realtime', label: 'Real-time' },
                ]}
                onPick={(v) => setLiveConfigV2({ searchMode: v as typeof cfg.searchMode })}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {cfg.searchMode === 'off'
                  ? "Answers from the model's own knowledge — no web calls."
                  : caps.nativeWebSearch
                    ? 'Grounds fresh asks in live results with citations when a question needs it.'
                    : "This model has no built-in search, so Real-time won't ground anything right now. The four direct providers support it; on OpenRouter it depends on the selected model. Pick a search-capable model or leave this off."}
              </span>
            </div>

            {/* Explanation level — Standard by default; Simple makes both the words and the visuals
            plainer; In-depth is the full-rigor treatment. Switchable by voice too ("explain like
            I'm 5" / "go deeper"). */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Explanation level</span>
              <SegRow
                value={cfg.explainLevel}
                options={[
                  { value: 'simple', label: 'Simple', badge: "like I'm 5" },
                  { value: 'standard', label: 'Standard', badge: 'default' },
                  { value: 'deep', label: 'In-depth', badge: 'full rigor' },
                ]}
                onPick={(v) => setLiveConfigV2({ explainLevel: v as typeof cfg.explainLevel })}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                How answers are written: Simple uses shorter sentences, everyday analogies, and
                fewer, more-labelled visuals; In-depth goes further — mechanisms, numbers, edge
                cases. You can also just say "explain it simpler" or "go deeper". (How long Mavéa
                thinks is Thinking time, below.)
              </span>
            </div>

            {/* Thinking time (cfg.quality) — how long the model REASONS, a speed/care dial.
                Deliberately named apart from Explanation level: "Answer quality" next to
                Simple/Standard/In-depth read as the same dial in different words. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Thinking time</span>
              <SegRow
                value={cfg.quality}
                options={[
                  { value: 'fast', label: 'Fast', badge: 'snappiest' },
                  { value: 'balanced', label: 'Balanced', badge: 'default' },
                  { value: 'thorough', label: 'Thorough', badge: 'thinks longer' },
                ]}
                onPick={(v) => setLiveConfigV2({ quality: v as typeof cfg.quality })}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                How long Mavéa reasons before answering — speed versus care on hard questions. (How
                the answer is written is Explanation level, above.)
              </span>
            </div>

            {/* Visual richness — the device performance tier. Auto senses weak hardware (and can
            step down if the machine janks); Lite calms the animated face + glass blur for older
            machines; Full forces the rich experience everywhere. Per-device, not synced. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Visual richness</span>
              <SegRow
                value={perfMode}
                options={[
                  { value: 'auto', label: 'Auto', badge: 'recommended' },
                  { value: 'full', label: 'Full' },
                  { value: 'lite', label: 'Lite', badge: 'older machines' },
                ]}
                onPick={(v) => pickPerfMode(v as PerfMode)}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Auto matches the effects to your machine. Lite calms the animated face and drops the
                glass blur so Mavéa stays smooth on older or lower-powered computers.
              </span>
            </div>

            {/* Voice — which synthesizer speaks. Auto uses Kokoro wherever it keeps up and the
            browser's own voice where it doesn't; the overrides hold on any machine, because
            refusing to let someone run the good voice on their own computer isn't ours to do.
            Per-device, not synced: it's about this machine, not the account. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Voice</span>
              <SegRow
                value={voiceModeChoice}
                options={[
                  { value: 'auto', label: 'Auto', badge: 'recommended' },
                  { value: 'kokoro', label: 'Natural', badge: 'needs Docker' },
                  { value: 'browser', label: 'System', badge: 'older machines' },
                ]}
                onPick={(v) => pickVoiceMode(v as VoiceMode)}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Natural is Kokoro, the voice Mavéa is built around — it needs the Docker container
                and a machine that can keep up with it. System is your computer&rsquo;s own voice:
                plainer, but it costs nothing and stays in step on older hardware. Without either,
                lines appear as captions.
              </span>
            </div>
            <AdvancedGroup>
              <ToggleRow
                label="Pen mode"
                on={cfg.annotationsEnabled}
                onToggle={() => {
                  const next = !cfg.annotationsEnabled;
                  setLiveConfigV2({ annotationsEnabled: next, teachMode: next });
                }}
                note="Mavéa draws on the canvas as it speaks — circling numbers, striking out misconceptions, annotating every walkthrough stop. Muted walks also write margin notes beside the cards, so you keep the marked-up answer. Off: the pen stays quiet entirely."
              />
              {cfg.searchMode !== 'off' && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                  <Icon.globe style={{ width: 14, height: 14, flex: '0 0 auto', marginTop: 1 }} />
                  You'll see "Searching…" whenever a search actually runs.
                </span>
              )}
              <ToggleRow
                label="Keep a library"
                on={cfg.libraryEnabled}
                onToggle={() => setLiveConfigV2({ libraryEnabled: !cfg.libraryEnabled })}
                note="Saves the canvases you generate on this device so you can pick any one back up from the welcome screen. On by default; turn it off or clear the library any time."
              />
              {cfg.libraryEnabled && library.length > 0 && (
                <div style={{ marginLeft: 48 }}>
                  <button
                    type="button"
                    onClick={() => clearLibrary()}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: '3px 9px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      font: 'inherit',
                      fontSize: 12,
                    }}
                  >
                    Clear library ({library.length})
                  </button>
                </div>
              )}
            </AdvancedGroup>
          </>
        )}

        {tab === 'you' && (
          <>
            <FeatureUseNotice kind="stored-data" from="live" />
            <ToggleRow
              label="Remember me"
              on={cfg.memoryEnabled}
              onToggle={() => setLiveConfigV2({ memoryEnabled: !cfg.memoryEnabled })}
              note="Stored facts stay on this device. While Memory is enabled, relevant facts are included in future requests to your selected model provider. You can inspect, edit, export, or forget each stored fact below."
            />
            {cfg.memoryEnabled && (
              <div style={{ marginLeft: 48, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {facts.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Nothing remembered yet — Mavéa will build a concept wiki as you talk.
                  </span>
                ) : (
                  <>
                    {/* View toggle: Concepts list vs Graph */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: 2,
                          padding: 2,
                          borderRadius: 8,
                          background: 'var(--track)',
                          border: '1px solid var(--line)',
                          alignSelf: 'flex-start',
                        }}
                      >
                        {(['list', 'graph'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setMemView(v)}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: memView === v ? 'var(--surface-elevated)' : 'transparent',
                              boxShadow: memView === v ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                              color: memView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                              cursor: 'pointer',
                              font: 'inherit',
                              fontSize: 12,
                              fontWeight: memView === v ? 600 : 400,
                            }}
                          >
                            {v === 'list' ? 'Concepts' : 'Graph'}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => forgetAll()}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--line)',
                          borderRadius: 8,
                          padding: '3px 9px',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          font: 'inherit',
                          fontSize: 12,
                        }}
                      >
                        Forget all
                      </button>
                    </div>

                    {memView === 'graph' ? (
                      <MemoryGraph nodes={facts} />
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          maxHeight: 280,
                          overflowY: 'auto',
                        }}
                      >
                        {groupedNodes(facts).map(({ namespace, nodes: nsNodes }) => (
                          <div
                            key={namespace}
                            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                          >
                            <span
                              style={{
                                fontFamily: 'var(--font-data, inherit)',
                                fontSize: 10,
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: 'var(--text-muted)',
                                margin: '2px 2px 0',
                              }}
                            >
                              {namespaceLabel(namespace)}
                            </span>
                            <ul
                              style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                              }}
                            >
                              {nsNodes.map((n) => (
                                <MemoryFactRow key={n.id} node={n} ago={formatAgo(n.updatedAt)} />
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {facts.length} {facts.length === 1 ? 'concept' : 'concepts'} · {factsKb} KB
                        on this device
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadOKFBundle(facts)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--line)',
                          borderRadius: 8,
                          padding: '3px 9px',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          font: 'inherit',
                          fontSize: 12,
                        }}
                      >
                        Export memory
                      </button>
                    </div>
                  </>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                  <Icon.sparkle style={{ width: 14, height: 14, flex: '0 0 auto', marginTop: 1 }} />
                  {`Stored on this device, and sent to ${info.label.split(' · ')[1] ?? info.label} inside each prompt to personalize answers — the same path as your questions.`}
                </span>
              </div>
            )}

            {/* voice — push-to-talk mechanics and ambient toggles live under More options. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={labelStyle}>Voice</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mavéa</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      <DropSelect
                        ariaLabel="Mavéa's voice"
                        value={maveaVoice}
                        onChange={(id) => {
                          setMaveaVoice(id);
                          applyVoice(id);
                          const p = findPreset(id);
                          if (p) previewVoice(p);
                        }}
                        options={VOICE_PRESETS.map((p) => ({
                          value: p.id,
                          label: p.label,
                          note: p.tone,
                        }))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const p = findPreset(maveaVoice);
                        if (p) previewVoice(p);
                      }}
                      style={{
                        ...inputStyle,
                        width: 'auto',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                      title="Preview voice"
                      aria-label="Preview Mavéa's voice"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>
              <VoiceOffHint />
            </div>

            {/* Flashcards — a plain pile, or a schedule. Switching either way is lossless: the two
                styles write disjoint fields, so a flip-through never touches a card's schedule and
                a schedule is never consulted while the pile is on. Hidden until there's a card to
                govern; before that, the one-time question on the first save covers it. */}
            {cardCounts.total > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Flashcards</span>
                <SegRow
                  label="Flashcards"
                  value={studyStyle}
                  options={[
                    { value: 'collection', label: 'Just save them' },
                    { value: 'spaced', label: 'Help me remember' },
                  ]}
                  onPick={(v) => setStudyStyle(v as StudyStyle)}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {studyStyle === 'collection'
                    ? 'A plain pile you flip through when you feel like it. No dates, no counts, nothing waiting for you.'
                    : `Each card comes back just before you'd forget it. New ones join ${newPerDay} a day, so a big pile never lands at once.`}
                </span>
              </div>
            )}

            <AdvancedGroup defaultOpen={initialAdvancedYouOpen}>
              {/* Push-to-talk key — only relevant when using tap mode, not always-on */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Hold to talk key <span style={{ opacity: 0.6 }}>(tap mode only)</span>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(
                    [
                      { key: 'Alt', label: 'Alt' },
                      { key: 'Control', label: 'Ctrl' },
                      { key: 'Shift', label: 'Shift' },
                    ] as const
                  ).map(({ key, label }) => {
                    const active = (cfg.pttKey || 'Alt') === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLiveConfigV2({ pttKey: key })}
                        style={pttBtnStyle(active)}
                        aria-pressed={active}
                        title={`Hold ${label} to talk (shows as ${pttKeyLabel(key, cfg.pttSide)} in the hint)`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {/* Which physical key — pin to one side so the other stays free for shortcuts */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(
                    [
                      { side: 'any', label: 'Either side' },
                      { side: 'left', label: 'Left' },
                      { side: 'right', label: 'Right' },
                    ] as const
                  ).map(({ side, label }) => {
                    const active = (cfg.pttSide || 'any') === side;
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setLiveConfigV2({ pttSide: side })}
                        style={pttBtnStyle(active)}
                        aria-pressed={active}
                        title={
                          side === 'any'
                            ? 'Either side of the key talks'
                            : `Only the ${label.toLowerCase()} key talks`
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ToggleRow
                label="Morning brief"
                on={cfg.morningBrief}
                onToggle={() => setLiveConfigV2({ morningBrief: !cfg.morningBrief })}
                note="On the first open of the day, Mavéa opens with a quick read on the things you track."
              />
              <ToggleRow
                label="Save flashcards automatically"
                on={cfg.autoSaveFlashcards}
                onToggle={() => setLiveConfigV2({ autoSaveFlashcards: !cfg.autoSaveFlashcards })}
                note="When an answer already contains flashcards, keep them without asking. Off by default — the usual way is tapping “Cards” on the answer you want. Every save shows a pill with Undo, so it's never silent."
              />
              <ToggleRow
                label="Quiet hours"
                on={quietHours}
                onToggle={() => {
                  setQuietHoursEnabled(!quietHours);
                  setQuietHours(!quietHours);
                }}
                note="10 PM – 6 AM: the screen dims and the voice drops to a murmur — won't wake anyone."
              />
            </AdvancedGroup>
          </>
        )}

        {tab === 'data' && (
          <>
            <FeatureUseNotice kind="stored-data" from="live" />
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>
              Export a backup, or import one you saved.{' '}
              <strong>Stored only in this browser.</strong> Because your data is encrypted to this
              exact browser, copying it to incognito, another port, or another computer won’t work —
              export a backup here and import it there.
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--text-muted)',
              }}
            >
              <li>
                Includes your dashboards, memory, flashcards, saved canvases, map, and courses.
              </li>
              <li>
                Your API keys are <strong>never included</strong> — you’ll re-enter them on a new
                device.
              </li>
              <li>
                Importing <strong>merges</strong> — it adds and updates, and never erases what’s
                already here.
              </li>
              <li>
                The file is plain, unencrypted JSON: keep it somewhere safe, import only files you
                trust.
              </li>
            </ul>
            <div className="settings-transfer-row">
              <button
                type="button"
                className="settings-transfer-btn"
                onClick={() => void handleBackupExport()}
              >
                Export all my data
              </button>
              <button
                type="button"
                className="settings-transfer-btn"
                onClick={() => backupInputRef.current?.click()}
              >
                Import a backup
              </button>
              <input
                ref={backupInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                aria-hidden="true"
                onChange={handleBackupImport}
              />
              {backupNote && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }} role="status">
                  {backupNote}
                </span>
              )}
              {backupError && (
                <span className="settings-import-error" role="alert">
                  {backupError}
                </span>
              )}
            </div>
          </>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px 12px',
            paddingTop: 14,
            borderTop: '1px solid var(--line-soft)',
            color: 'var(--text-muted)',
            fontSize: 10.5,
          }}
        >
          <a href="#/terms?from=live" style={{ color: 'inherit' }}>
            Terms
          </a>
          <a href="#/privacy?from=live" style={{ color: 'inherit' }}>
            Privacy
          </a>
          <a href="#/legal?from=live" style={{ color: 'inherit' }}>
            Important information
          </a>
          <a
            href={legalDocumentHref('LICENSE.txt')}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'inherit' }}
          >
            License
          </a>
          <button
            type="button"
            onClick={() => {
              resetLegalAcceptance();
              setLegalReset(true);
            }}
            style={{
              marginLeft: 'auto',
              padding: 0,
              border: 0,
              color: 'inherit',
              background: 'transparent',
              font: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              cursor: 'pointer',
            }}
          >
            {legalReset ? 'Review will appear next visit' : 'Review acknowledgement again'}
          </button>
        </div>
      </div>
    </div>
  );
}
