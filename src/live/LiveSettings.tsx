// LiveSettings.tsx — the BYOK picker for the Live surface: choose a provider,
// model, and paste a key. Shows the live "operating point" (speed vs depth) and a readiness dot.
// Keys stay in memory unless Remember stores encrypted ciphertext on this device; requests travel
// through the deployment's same-origin proxy to the chosen provider. Styling leans on design
// tokens (works in dark + light).
import {
  useCallback,
  useEffect,
  useId,
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
import { UsagePanel } from './usage/UsagePanel';
import { FeatureUseNotice } from '../legal/FeatureUseNotice';
import { VISIBLE_PROVIDERS, providerInfo, getAdapter } from './providers';
import {
  useLiveConfig,
  setLiveConfigV2,
  setProviderField,
  getLiveConfigV2,
  toModelConfig,
  exportConfig,
  importConfigWithSummary,
  type CredentialField,
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
import { previewVoice, stopPreview } from '../voice/preview';
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

const MAX_SETTINGS_IMPORT_BYTES = 1_000_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function credentialName(field: CredentialField): string {
  if (field === 'provider-api-keys') return 'provider API keys';
  if (field === 'search-api-keys') return 'search API keys';
  return 'GitHub tokens';
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** FileReader is used instead of File.text() so closing Settings can abort a large read. */
function readTextFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = (): void => signal.removeEventListener('abort', abort);
    const finish = (settle: () => void): void => {
      cleanup();
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      settle();
    };
    const abort = (): void => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      else finish(() => reject(new DOMException('Import cancelled', 'AbortError')));
    };
    reader.onload = () =>
      finish(() =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('The selected file could not be read as text.')),
      );
    reader.onerror = () =>
      finish(() => reject(reader.error ?? new Error('The selected file could not be read.')));
    reader.onabort = () => finish(() => reject(new DOMException('Import cancelled', 'AbortError')));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else reader.readAsText(file);
  });
}

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

/** The tab strip, in visual order — also the order the arrow keys walk. */
const TABS = ['model', 'settings', 'you', 'data'] as const;
type SettingsTab = (typeof TABS)[number];

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
  const noteId = useId();
  return (
    // A <label>, so clicking the text or the note flips the switch (a button is labelable, so this
    // adds no second tab stop) — the same affordance as the native checkbox row on the Model tab.
    // jsx-a11y only recognises input/select/textarea as a label's control, so it can't see the
    // button below; the HTML spec can.
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={noteId}
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
        <span id={noteId} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {note}
        </span>
      </div>
    </label>
  );
}

function ArmedActionButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}): ReactElement {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      style={{
        background: armed ? 'color-mix(in oklab, var(--warning) 10%, transparent)' : 'transparent',
        border: `1px solid ${armed ? 'var(--warning)' : 'var(--line)'}`,
        borderRadius: 8,
        padding: '3px 9px',
        color: armed ? 'var(--warning)' : 'var(--text-muted)',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 12,
      }}
    >
      {armed ? confirmLabel : label}
    </button>
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
  label: string;
}): ReactElement {
  // A radiogroup is ONE tab stop with arrows moving between options (WAI-ARIA radio pattern), so
  // the group carries a roving tabindex. When `value` matches nothing yet, the first option holds
  // it — otherwise the group would be unreachable by keyboard.
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  // The handler sits on the options, not the group: the group itself must never be focusable
  // under this pattern, and a key press always reaches the focused option first anyway.
  const move = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (activeIndex + step + options.length) % options.length;
    onPick(options[next].value);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
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
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === activeIndex ? 0 : -1}
            onClick={() => onPick(o.value)}
            onKeyDown={move}
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
  initialTab?: SettingsTab;
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
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'model');

  const [ready, setReady] = useState<{ llm: boolean; model: boolean; statusCode?: number } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [probeError, setProbeError] = useState(false);
  const probeSeq = useRef(0);
  const mountedRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const settingsImportAbortRef = useRef<AbortController | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Whole-app backup (dashboards, memory, flashcards, …) — separate from the settings-only export
  // above. Its heavy machinery (every store) is lazy-imported on click so it never enters this chunk.
  const backupInputRef = useRef<HTMLInputElement>(null);
  const backupImportAbortRef = useRef<AbortController | null>(null);
  const backupOperationRef = useRef<'export' | 'import' | null>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  // Board-grade modal behavior, matching the other Live overlays: trap focus inside the dialog
  // and close on Escape (it previously closed only on a backdrop click — a keyboard/a11y gap).
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      probeSeq.current += 1;
      settingsImportAbortRef.current?.abort();
      backupImportAbortRef.current?.abort();
      stopPreview();
    };
  }, []);

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

  async function handleImportFile(e: { target: HTMLInputElement }): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (settingsImportAbortRef.current) return;
    setImportError(null);
    setImportNote(null);
    if (file.size > MAX_SETTINGS_IMPORT_BYTES) {
      setImportError('That file is too large to be a Mavéa settings file.');
      return;
    }
    const controller = new AbortController();
    settingsImportAbortRef.current = controller;
    setImportBusy(true);
    try {
      const text = await readTextFile(file, controller.signal);
      const summary = importConfigWithSummary(text);
      if (mountedRef.current) {
        const applied = summary.appliedFields.length
          ? `Imported ${countLabel(summary.appliedFields.length, 'setting')}.`
          : 'No recognized settings found.';
        const ignored = summary.credentialsIgnored.length
          ? ` Ignored ${summary.credentialsIgnored.map(credentialName).join(', ')}; credentials are never imported.`
          : ' Credentials were not imported.';
        setImportNote(`${applied}${ignored}`);
      }
    } catch (err) {
      if (mountedRef.current && !isAbortError(err)) {
        setImportError(err instanceof Error ? err.message : 'Import failed.');
      }
    } finally {
      if (settingsImportAbortRef.current === controller) {
        settingsImportAbortRef.current = null;
        if (mountedRef.current) setImportBusy(false);
      }
    }
  }

  async function handleBackupExport(): Promise<void> {
    if (backupOperationRef.current) return;
    backupOperationRef.current = 'export';
    setBackupBusy('export');
    setBackupError(null);
    setBackupNote(null);
    try {
      const { downloadBackup } = await import('./backup/backup');
      await downloadBackup();
      if (mountedRef.current) setBackupNote('Backup downloaded.');
    } catch {
      if (mountedRef.current) setBackupError('Couldn’t build the backup — please try again.');
    } finally {
      backupOperationRef.current = null;
      if (mountedRef.current) setBackupBusy(null);
    }
  }

  async function handleBackupImport(e: { target: HTMLInputElement }): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (backupOperationRef.current) return;
    backupOperationRef.current = 'import';
    setBackupBusy('import');
    setBackupError(null);
    setBackupNote(null);
    const controller = new AbortController();
    backupImportAbortRef.current = controller;
    try {
      const { importBackup, MAX_BACKUP_BYTES } = await import('./backup/backup');
      // Reject before FileReader allocates a string for a file that cannot be a valid backup.
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error('That file is too large to be a Mavéa backup.');
      }
      const text = await readTextFile(file, controller.signal);
      const s = await importBackup(text);
      const parts = [
        [s.dashboards, 'dashboard'],
        [s.memory, 'memory item'],
        [s.flashcards, 'card'],
        [s.library, 'saved canvas', 'saved canvases'],
        [s.atlas, 'map record'],
        [s.courses, 'course'],
      ] as const;
      const merged = parts
        .filter(([n]) => n > 0)
        .map(([n, one, many]) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`);
      if (mountedRef.current) {
        const sections = Object.values(s.sections);
        const rejected = sections.reduce((total, section) => total + section.rejected, 0);
        const conflicts = sections.reduce((total, section) => total + section.conflicts, 0);
        const evicted = sections.reduce((total, section) => total + section.evictedExisting, 0);
        const details = [
          merged.length ? `Merged ${merged.join(', ')}.` : 'Nothing new to merge from that file.',
        ];
        if (s.settingsApplied) details.push('Recognized settings were applied.');
        if (conflicts) {
          details.push(`${countLabel(conflicts, 'incoming ID')} matched records already present.`);
        }
        if (rejected) {
          details.push(
            `${countLabel(rejected, 'entry', 'entries')} ${rejected === 1 ? 'was' : 'were'} rejected as invalid.`,
          );
        }
        if (evicted) {
          details.push(
            `${countLabel(evicted, 'existing record')} ${evicted === 1 ? 'was' : 'were'} evicted by bounded store capacity.`,
          );
        }
        if (s.credentialsIgnored.length) {
          details.push(
            `Ignored ${s.credentialsIgnored.map(credentialName).join(', ')}; credentials are never imported.`,
          );
        }
        if (s.versionAhead) {
          details.push('This backup uses a newer format; only recognized data was merged.');
        }
        details.push(
          'Changes are visible now; persistence is best-effort because browser storage writes cannot be verified.',
        );
        setBackupNote(details.join(' '));
      }
    } catch (err) {
      if (mountedRef.current && !isAbortError(err)) {
        setBackupError(err instanceof Error ? err.message : 'Import failed.');
      }
    } finally {
      if (backupImportAbortRef.current === controller) backupImportAbortRef.current = null;
      backupOperationRef.current = null;
      if (mountedRef.current) setBackupBusy(null);
    }
  }

  const [maveaVoice, setMaveaVoice] = useState(() =>
    storedVoice(VOICE_MAVEA_STORAGE_KEY, DEFAULT_MAVEA_VOICE_ID),
  );

  // Visual richness — a per-DEVICE setting (localStorage, not the synced LiveConfig): it's about
  // this machine's GPU, not the account. Picking a mode persists it and re-resolves + applies the
  // tier onto <html data-perf> right away, so the change is visible without a reload.
  const [perfMode, setPerfMode] = useState<PerfMode>(() => readPerfMode());
  const pickPerfMode = useCallback((mode: PerfMode) => {
    setPerfMode(mode);
    writePerfMode(mode);
    applyPerfTier(resolveTierNow());
  }, []);

  const probe = useCallback(async () => {
    const seq = ++probeSeq.current;
    setChecking(true);
    setProbeError(false);
    try {
      // The readiness probe lives in the catalog-free leaf ./ready — import it directly (no longer
      // via generateLive, which would drag the turn engine + catalog into the settings chunk).
      const { checkLiveReady } = await import('./ready');
      const r = await checkLiveReady(toModelConfig(getLiveConfigV2()), { tts: false });
      if (seq === probeSeq.current) {
        setReady({ llm: r.llm, model: r.model, statusCode: r.statusCode });
      }
    } catch {
      if (seq === probeSeq.current) {
        setReady(null);
        setProbeError(true);
      }
    } finally {
      if (seq === probeSeq.current) setChecking(false);
    }
  }, []);

  // Re-probe shortly after any provider/model/key change settles — but never with no key in hand.
  // A remembered key is decrypted from IndexedDB asynchronously, so opening Settings within the
  // first moments of a session finds `key` still empty; probing then tested nothing, came back
  // rejected, and painted a working setup as invalid until the vault landed and flipped it back.
  // No key means no verdict, not a bad verdict — the same rule the Connect step already follows.
  useEffect(() => {
    if (info.needsKey && !key) {
      setReady(null);
      return;
    }
    const t = setTimeout(() => void probe(), 400);
    return () => clearTimeout(t);
  }, [cfg.provider, model, key, probe, info.needsKey]);

  const dotColor = checking
    ? 'var(--text-muted)'
    : ready?.llm && ready?.model
      ? 'var(--insight)'
      : 'var(--warning)';
  const readyText = checking
    ? 'Checking…'
    : probeError
      ? 'Couldn’t check readiness — try again'
      : ready?.llm && ready?.model
        ? 'Ready'
        : ready?.llm
          ? 'Reachable — model not found'
          : info.needsKey && !key
            ? 'Add your API key'
            : ready?.statusCode === 401 || ready?.statusCode === 400
              ? // Google reports a bad key as 400 API_KEY_INVALID; OpenAI-style providers use 401.
                'Invalid API key'
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

      {/* Tab nav — one tab stop, arrows walk the strip (WAI-ARIA tabs pattern) with automatic
          activation, so the panel follows the arrow the way a mouse click would. */}
      <div className="ls-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`ls-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`ls-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            className={`ls-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = TABS[(i + step + TABS.length) % TABS.length];
              setTab(next);
              document.getElementById(`ls-tab-${next}`)?.focus();
            }}
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

      {/* Tab body — one panel container; only the active tab's content renders inside it. */}
      <div
        className="ls-body"
        role="tabpanel"
        id={`ls-panel-${tab}`}
        aria-labelledby={`ls-tab-${tab}`}
      >
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
                  Kept in memory unless Remember can store encrypted ciphertext on this device. If
                  browser encryption is unavailable, it stays session-only and is never saved as
                  plaintext. Sent through this deployment to{' '}
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
              <span role="status" aria-live="polite" aria-busy={checking}>
                {readyText}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: 'var(--text-muted)' }}>{info.hint}</span>
              <button
                onClick={() => void probe()}
                disabled={checking}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  color: 'var(--text-muted)',
                  cursor: checking ? 'wait' : 'pointer',
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
                    ? 'encrypted on this device when supported; otherwise session-only — never saved as plaintext'
                    : 'kept in memory only — cleared on reload'}
                </span>
              </label>
            )}
            <ProviderResponsibilityNotice />
            {/* What this session actually spent on the reader's own key. It sits under the key
                field on purpose — the cost signal belongs beside the thing paying it. */}
            <section aria-labelledby="ls-usage-heading">
              <h4 id="ls-usage-heading" className="ls-usage-heading">
                This session&rsquo;s tokens
              </h4>
              <UsagePanel />
            </section>
            <div className="settings-transfer-row" aria-busy={importBusy}>
              <button type="button" className="settings-transfer-btn" onClick={handleExport}>
                Export settings
              </button>
              <button
                type="button"
                className="settings-transfer-btn"
                disabled={importBusy}
                onClick={() => importInputRef.current?.click()}
              >
                {importBusy ? 'Importing settings…' : 'Import settings'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                disabled={importBusy}
                style={{ display: 'none' }}
                aria-hidden="true"
                onChange={(event) => void handleImportFile(event)}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                API and search keys are never included.
              </span>
              {importError && (
                <span className="settings-import-error" role="alert">
                  {importError}
                </span>
              )}
              {importNote && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }} role="status">
                  {importNote}
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
                label="Web search"
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
                label="Explanation level"
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
                label="Thinking time"
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
                label="Visual richness"
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
                label="Living answers"
                on={cfg.worldEnabled}
                onToggle={() => setLiveConfigV2({ worldEnabled: !cfg.worldEnabled })}
                note="When you ask why something happened, Mavéa offers the causal web behind the answer — every arrow shows its source, and follow-ups reshape the same web instead of starting over. Offering one is free: it is generated only when you open it, once, and then it's kept."
              />
              <ToggleRow
                label="Keep a library"
                on={cfg.libraryEnabled}
                onToggle={() => setLiveConfigV2({ libraryEnabled: !cfg.libraryEnabled })}
                note="Saves the canvases you generate on this device so you can pick any one back up from the welcome screen. On by default; turn it off or clear the library any time."
              />
              {library.length > 0 && (
                <div style={{ marginLeft: 48 }}>
                  <ArmedActionButton
                    label={`Clear library (${library.length})`}
                    confirmLabel={`Confirm clear ${library.length === 1 ? 'saved canvas' : `${library.length} saved canvases`}`}
                    onConfirm={clearLibrary}
                  />
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
            <div style={{ marginLeft: 48, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {facts.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {cfg.memoryEnabled
                    ? 'Nothing remembered yet — Mavéa will build a concept wiki as you talk.'
                    : 'No stored concepts. Memory is off, so future conversations will not add any.'}
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
                      role="group"
                      aria-label="Memory view"
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
                          aria-pressed={memView === v}
                          onClick={() => setMemView(v)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: memView === v ? 'var(--surface-elevated)' : 'transparent',
                            boxShadow: memView === v ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
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
                    <ArmedActionButton
                      label="Forget all"
                      confirmLabel={`Confirm forget ${facts.length === 1 ? '1 concept' : `${facts.length} concepts`}`}
                      onConfirm={forgetAll}
                    />
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
                      {facts.length} {facts.length === 1 ? 'concept' : 'concepts'} · {factsKb} KB on
                      this device
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
                {cfg.memoryEnabled
                  ? `Stored on this device, and sent to ${info.label.split(' · ')[1] ?? info.label} inside each prompt to personalize answers — the same path as your questions.`
                  : 'Memory is off. Existing concepts stay on this device until you forget them, but they are not included in prompts.'}
              </span>
            </div>

            {/* voice — push-to-talk mechanics and ambient toggles live under More options. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={labelStyle}>Voice</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Microphone audio goes through this deployment to its configured Whisper endpoint;
                the default is loopback-only. Spoken replies use its configured Kokoro endpoint.
                Mavéa does not fall back to a browser-vendor speech service.
              </span>
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
                <span style={labelStyle}>Flashcards</span>
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
              {/* Push-to-talk key — only read while the mic is in Hold mode; Tap and Always on
                  never listen for it. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Hold to talk key <span style={{ opacity: 0.6 }}>(Hold mode only)</span>
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
                note="10 PM – 6 AM: the screen dims and voice output is reduced. Audibility still depends on your device volume and surroundings."
              />
            </AdvancedGroup>
          </>
        )}

        {tab === 'data' && (
          <>
            <FeatureUseNotice kind="stored-data" from="live" />
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>
              Export a backup, or import one you saved. <strong>Saved on this browser.</strong> Some
              content uses device-bound browser encryption; preferences and other records may use
              ordinary browser storage. A raw storage copy is not a portable backup — to move data
              to incognito, another port, browser, or computer, export it here and import it there.
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
                Includes supported dashboards, memory, flashcards, saved canvases, map records,
                courses, and settings.
              </li>
              <li>
                Provider/search keys and GitHub tokens are <strong>never included</strong>. Active
                turn history, refresh ledgers, caches, Ripple tracking, and device-only appearance,
                audio, and performance preferences are also excluded.
              </li>
              <li>
                Importing <strong>merges</strong> recognized data. It does not clear a store first,
                but bounded stores can evict older records when an import exceeds their capacity.
              </li>
              <li>
                The file is plain, unencrypted JSON: keep it somewhere safe, import only files you
                trust.
              </li>
            </ul>
            <div className="settings-transfer-row" aria-busy={backupBusy !== null}>
              <button
                type="button"
                className="settings-transfer-btn"
                disabled={backupBusy !== null}
                onClick={() => void handleBackupExport()}
              >
                {backupBusy === 'export' ? 'Exporting backup…' : 'Export a backup'}
              </button>
              <button
                type="button"
                className="settings-transfer-btn"
                disabled={backupBusy !== null}
                onClick={() => backupInputRef.current?.click()}
              >
                {backupBusy === 'import' ? 'Importing backup…' : 'Import a backup'}
              </button>
              <input
                ref={backupInputRef}
                type="file"
                accept="application/json,.json"
                disabled={backupBusy !== null}
                style={{ display: 'none' }}
                aria-hidden="true"
                onChange={(event) => void handleBackupImport(event)}
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
            onClick={resetLegalAcceptance}
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
            Review legal acknowledgement now
          </button>
        </div>
      </div>
    </div>
  );
}
