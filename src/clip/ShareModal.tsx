// The share experience: a sleek modal with the controls on the left and a live REEL preview in a
// phone frame on the right. A deterministic local director makes the finished reel from the
// conversation; you can recolor it (palette), reframe it (format), pick a quality, or ↻ Remix for a
// fresh cut. Share/Download renders the on-screen reel to an approved open-media file (MP4 with
// AV1 + Opus, else WebM) — the whole narration is synthesized
// up front and muxed as a deterministic track, so the downloaded clip's audio always plays and stays
// in sync. Direction and encoding stay local; narration uses the local Kokoro service. Styling lives
// in a scoped stylesheet (not inline) so controls get real hover/active/disabled states and the
// layout collapses to one column on a phone.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../live/useFocusTrap';
import { Icon } from '../icons/icons';
import type { TurnFrame } from '../live/history';
import type { TurnAudio } from '../live/scrubvoice/recorder';
import type { ClipAspect, ClipQuality, ClipTheme } from './types';
import { captureSupported, qualityHint, startStoryRecording, type StoryRecorder } from './capture';
import { downloadClip, shareClip } from './share';
import { toast } from '../lib/toast';
import { ReelPlayer } from './reel/ReelPlayer';
import { buildReelFallback, reseedFinishes } from './reel/director';
import {
  renderReelAudio,
  makePreviewAudio,
  type ReelAudio,
  type ReelPreviewAudio,
} from './reel/audioTrack';
import { PALETTES } from './reel/palette';
import type { ReelScript } from './reel/reelScript';
import { preloadAlternateFinishes } from './reel/templates/alternateLoader';
import { preloadIntentProps } from '../lib/preloadableLazy';
import { FeatureUseNotice } from '../legal/FeatureUseNotice';
import type { VideoStudioMode } from './conversation/types';
import './share-modal.css';

const ConversationVideoStudio = lazy(() =>
  import('./conversation/ConversationVideoStudio').then((module) => ({
    default: module.ConversationVideoStudio,
  })),
);

const FORMATS: { id: ClipAspect; label: string; w: number; h: number }[] = [
  { id: '9:16', label: 'Story', w: 12, h: 20 },
  { id: '1:1', label: 'Square', w: 16, h: 16 },
  { id: '16:9', label: 'Landscape', w: 20, h: 12 },
];

// The hint is derived from the encoder's own tier table (`qualityHint`), never restated here — a
// hand-written one drifted from it and advertised 60 fps for a tier the encoder renders at 30.
const QUALITIES: { id: ClipQuality; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

/** Export phases, surfaced as live progress so the modal never looks frozen during a render. The
 *  failed phase has no fixed label — it shows the specific reason the export stopped (`failure`). */
type Phase = 'idle' | 'voicing' | 'recording' | 'saving' | 'error';
const PHASE_LABEL: Record<Exclude<Phase, 'error'>, string> = {
  idle: '',
  voicing: 'Synthesizing narration…',
  recording: 'Recording the reel…',
  saving: 'Finishing the file…',
};

/** Narration synthesis is a real TTS call per slide; cache the result by its voiceover text so
 *  toggling preview sound more than once, or exporting right after previewing with sound on, never
 *  repeats that work. Keyed on the spoken lines alone — palette and Remix only reseed visual
 *  finishes, never voiceover text, so neither invalidates this. */
type ReelAudioCache = ReelAudio & { sig: string };

function voiceoverSig(script: ReelScript): string {
  // NUL-joined, not just concatenated — two different slide splits of the same running text
  // (e.g. one long line vs the same words split across two slides) can never collide.
  return script.slides.map((s) => s.voiceover).join('\u0000');
}

export function ShareModal({
  frames,
  script: scriptProp,
  retainedAudio,
  onClose,
  onShared,
}: {
  /** The conversation to recut. Optional — omit it when handing in a prebuilt `script`. */
  frames?: TurnFrame[];
  /** A prebuilt reel (e.g. Prism's annotation reel). When present, the director is skipped entirely
   *  and Remix is disabled — the slides are already authored. */
  script?: ReelScript;
  /** Recent live PCM, keyed by stable frame identity. Missing tracks are synthesized before export. */
  retainedAudio?: (frame: TurnFrame) => TurnAudio | null;
  onClose: () => void;
  /** Fired once a clip is successfully downloaded or shared (lets the surface react). */
  onShared?: () => void;
}) {
  const [mode, setMode] = useState<VideoStudioMode>(scriptProp ? 'reel' : 'conversation');
  const [conversationBusy, setConversationBusy] = useState(false);
  const [aspect, setAspect] = useState<ClipAspect>('9:16');
  const [palette, setPalette] = useState<ClipTheme>('aurora');
  const [quality, setQuality] = useState<ClipQuality>('high');
  const [reel, setReel] = useState<ReelScript | null>(
    () => scriptProp ?? (frames?.length ? buildReelFallback(frames) : null),
  );
  const [recording, setRecording] = useState(false);
  const [recPlaying, setRecPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  // Why the last export stopped — kept so the failure survives its toast (see `failExport`).
  const [failure, setFailure] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  // Preview sound is off by default (autoplay policy + courtesy); the toggle is a user gesture that
  // synthesizes the narration on first use and unmutes it.
  const [soundOn, setSoundOn] = useState(false);
  const [soundLoading, setSoundLoading] = useState(false);
  // Drives ReelPlayer's controlled `paused` prop — the on-screen pause button and its space-bar
  // shortcut both funnel through `onPreviewPausedChange` below, so they can never drift apart.
  const [previewPaused, setPreviewPaused] = useState(false);
  // Bumped by the replay button — fed to ReelPlayer as `playKey` so it restarts the timeline from the
  // first slide in place, rather than a full remount that would drop other transient preview state.
  const [previewKey, setPreviewKey] = useState(0);

  const reelBusy = phase === 'voicing' || phase === 'recording' || phase === 'saving';
  const busy = mode === 'conversation' ? conversationBusy : reelBusy;
  /** The one line the modal says about a reel export: the live phase, or why it stopped. */
  const phaseLabel = phase === 'error' ? failure : PHASE_LABEL[phase];

  const frameElRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<StoryRecorder | null>(null);
  // The narration, rendered offline into one clean buffer — handed to the recorder as data (it
  // muxes it deterministically), never replayed through a realtime stream on this path.
  const audioRef = useRef<AudioBuffer | null>(null);
  const recTimingsRef = useRef<number[] | undefined>(undefined);
  const actionRef = useRef<'share' | 'download'>('share');
  const qualityRef = useRef<ClipQuality>('high');
  qualityRef.current = quality;
  const previewAudioRef = useRef<ReelPreviewAudio | null>(null);
  // The one synthesis result currently good for `shown` — shared by the preview sound toggle and
  // export, so preview narration is never synthesized again on export (see `voiceoverSig`).
  const audioCacheRef = useRef<ReelAudioCache | null>(null);
  // The exact per-slide timings the cached narration was co-timed to, once known — fed to the preview
  // ReelPlayer so it paces identically to what export will produce. Null until the first successful
  // synthesis; stays set afterward (muting doesn't discard it, only a new conversation does).
  const [previewTimings, setPreviewTimings] = useState<number[] | null>(null);
  const remixIntent = useMemo(
    () => preloadIntentProps(() => preloadAlternateFinishes().then(() => undefined)),
    [],
  );

  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Escape closes the modal — but never mid-export (matching the scrim/close-button busy guard).
  const requestClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  // Trap focus inside the dialog (move it in on open, restore it to the trigger on close) and route
  // Escape to requestClose — the modal's accessibility contract. Land initial focus on the reel
  // preview (frameElRef), not the first left-hand control, so its ← → ↑ ↓ / space shortcuts work
  // the instant the modal opens rather than after a stray click.
  useFocusTrap(dialogRef, { onEscape: requestClose, initialFocus: frameElRef });

  // Rebuild the local cut only when the conversation actually changes. Callers often pass a fresh
  // `frames` array each render, so depend on a stable content signature rather than object identity.
  const framesSig = (frames ?? []).map((f) => `${f.at}:${f.question}`).join('|');
  useEffect(() => {
    // New conversation → the cached narration is stale; drop it and reset the sound toggle.
    previewAudioRef.current?.stop();
    previewAudioRef.current = null;
    audioCacheRef.current = null;
    setPreviewTimings(null);
    setSoundOn(false);
    setPreviewPaused(false);
    setPreviewKey(0);
    // A prebuilt reel (Prism's annotation reel) skips the local director entirely.
    if (scriptProp) {
      setReel(scriptProp);
      return;
    }
    const sourceFrames = frames ?? [];
    // The deterministic cut is the final cut; opening Reel never calls a configured model provider.
    setReel(buildReelFallback(sourceFrames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesSig, scriptProp]);

  const shown = useMemo<ReelScript | null>(
    () => (reel ? { ...reel, palette } : null),
    [reel, palette],
  );
  // Two duration readings: the director's rough per-character estimate (always available, shown until
  // narration is actually synthesized) and the exact one implied by the real per-slide timings once
  // the preview (or export) has synthesized them — see the headline below.
  const roughSeconds = reel ? Math.max(6, Math.round(reel.durationMs / 1000)) : 0;
  const exactSeconds = previewTimings
    ? Math.max(6, Math.round(previewTimings.reduce((a, ms) => a + ms, 0) / 1000))
    : null;
  const seconds = exactSeconds ?? roughSeconds;

  // Identifies the actual on-screen ReelPlayer instance — used as its React `key` below. Aspect,
  // Remix (seed), and the rough→synced timing swap all remount the player with a fresh `.reel` node,
  // and ReelPlayer refocuses itself on each such (interactive) mount, so the ← → ↑ ↓ / space
  // shortcuts keep working across those without a stray click. First-open focus is handled by the
  // focus trap's initialFocus above.
  const reelKey = shown
    ? `${aspect}-${recording ? 'rec' : `preview-${shown.seed}-${previewTimings ? 'synced' : 'rough'}`}`
    : null;

  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;

  // Sound toggle: synthesize narration on first use so the local service stays idle until the user
  // wants sound — or reuse it from `audioCacheRef` if it's already good for the current script.
  // Once we have it, its exact per-slide timings replace the director's rough estimate (`previewTimings`
  // below), so from this point on the preview paces EXACTLY like the exported clip, not just roughly —
  // the narration itself still restarts from the top on toggle and on each preview loop.
  const toggleSound = useCallback(async () => {
    if (soundOn) {
      previewAudioRef.current?.setMuted(true);
      setSoundOn(false);
      return;
    }
    if (!shown) return;
    const sig = voiceoverSig(shown);
    let cache = audioCacheRef.current;
    if (!cache || cache.sig !== sig) {
      setSoundLoading(true);
      try {
        cache = { sig, ...(await renderReelAudio(shown)) };
        audioCacheRef.current = cache;
      } catch {
        toast('Could not prepare the narration', 'warn');
        return;
      } finally {
        setSoundLoading(false);
      }
    }
    // A silent result is cached like any other, so repeat clicks land here without re-synthesizing —
    // say why every time rather than letting the button spin and go quiet again.
    if (!cache.buffer) {
      toast('Narration is unavailable. Check the local voice service, then retry.', 'warn');
      return;
    }
    if (!previewAudioRef.current) previewAudioRef.current = makePreviewAudio(cache.buffer);
    previewAudioRef.current?.setMuted(false);
    previewAudioRef.current?.play();
    // Sound can be switched on while the reel is already paused — start the narration in the same
    // state the visual is already in, rather than letting it run ahead unheard.
    if (previewPaused) previewAudioRef.current?.pause();
    setPreviewTimings(cache.timings);
    setSoundOn(true);
  }, [soundOn, shown, previewPaused]);

  useEffect(
    () => () => {
      previewAudioRef.current?.stop();
      previewAudioRef.current = null;
    },
    [],
  );

  // The pause button and the ReelPlayer space-bar shortcut both resolve here (as ReelPlayer's
  // controlled `onPausedChange`), so the narration audio can never drift out of sync with the frozen
  // timeline — pausing the visual always pauses what's audible, not just the on-screen clock.
  const onPreviewPausedChange = useCallback((next: boolean) => {
    setPreviewPaused(next);
    if (!soundOnRef.current) return;
    if (next) previewAudioRef.current?.pause();
    else previewAudioRef.current?.resume();
  }, []);

  // Restart from the first slide without a full remount (playKey re-triggers ReelPlayer's own
  // restart effect) — and, if sound is on, restart the cached narration from the top too.
  const replayPreview = useCallback(() => {
    setPreviewPaused(false);
    setPreviewKey((k) => k + 1);
    if (soundOnRef.current) previewAudioRef.current?.play();
  }, []);

  const cleanupExport = useCallback((next: Phase = 'idle') => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    audioRef.current = null;
    recTimingsRef.current = undefined;
    setRecording(false);
    setRecPlaying(false);
    setPhase(next);
  }, []);

  // One place to fail an export: the toast the user sees and the line that persists under the
  // actions are the same sentence, so the two can never drift apart.
  const failExport = useCallback(
    (message: string) => {
      toast(message, 'warn');
      setFailure(message);
      cleanupExport('error');
    },
    [cleanupExport],
  );

  useEffect(() => () => cleanupExport(), [cleanupExport]);

  // Once the record-mode reel is mounted, start the recorder; then start audio + the timeline together.
  useEffect(() => {
    if (!recording || !frameReady || recorderRef.current || !frameElRef.current) return;
    let cancelled = false;
    // The narration's true length (the slide timings the audio was co-timed to) bounds the recording,
    // so the muxed video can't outlast its audio even if a heavy finish makes the timeline run slow.
    const narrationMs = (recTimingsRef.current ?? []).reduce((a, ms) => a + ms, 0);
    void startStoryRecording({
      el: frameElRef.current,
      audioBuffer: audioRef.current,
      aspect,
      quality: qualityRef.current,
      maxDurationMs: narrationMs ? narrationMs + 900 : undefined,
    })
      .then((r) => {
        if (cancelled) {
          r.cancel();
          return;
        }
        recorderRef.current = r;
        setRecPlaying(true);
      })
      .catch(() => failExport("Couldn't render the clip in this browser"));
    return () => {
      cancelled = true;
    };
  }, [recording, frameReady, aspect, failExport]);

  const exportClip = useCallback(
    (action: 'share' | 'download') => {
      if (busy || !shown) return;
      if (!captureSupported()) {
        toast("This browser can't render a video clip", 'warn');
        return;
      }
      actionRef.current = action;
      setFailure(null);
      setPhase('voicing');
      // Reuse the narration synthesized for the preview when it's still good for this script (the
      // common "preview with sound, then export" path) instead of re-synthesizing it — otherwise
      // synthesize the full narration up front. Either way, start a single recorded pass once it's in.
      const sig = voiceoverSig(shown);
      const cached = audioCacheRef.current;
      const audioReady: Promise<ReelAudio> =
        cached && cached.sig === sig ? Promise.resolve(cached) : renderReelAudio(shown);
      void audioReady
        .then((audio) => {
          audioCacheRef.current = { sig, ...audio };
          const { buffer, timings, missing, firstMissingLine } = audio;
          if (!buffer || missing > 0) {
            const line = firstMissingLine
              ? ` for “${firstMissingLine.slice(0, 72)}${firstMissingLine.length > 72 ? '…' : ''}”`
              : '';
            failExport(
              `Narration is unavailable${line}. Check the local voice service, then retry.`,
            );
            return;
          }
          recTimingsRef.current = timings;
          audioRef.current = buffer;
          setRecPlaying(false);
          setFrameReady(false);
          setPhase('recording');
          setRecording(true);
        })
        .catch(() => failExport('Could not prepare the narration'));
    },
    [busy, shown, failExport],
  );

  const onRecordDone = useCallback(async () => {
    const r = recorderRef.current;
    if (!r) {
      cleanupExport();
      return;
    }
    recorderRef.current = null;
    setPhase('saving');
    try {
      const result = await r.stop();
      if (actionRef.current === 'download') {
        downloadClip(result.blob, undefined, () => void result.dispose?.());
        toast('Saved to your downloads', 'good');
      } else {
        const how = await shareClip(result, { title: 'My Mavéa reel', text: 'Made with Mavéa' });
        if (how === 'cancelled') {
          // This recorder has no reusable ready-file state. A dismissed sheet is intentionally
          // quiet, but its temporary backing file still needs an explicit owner to release it.
          await result.dispose?.();
          cleanupExport();
          return;
        }
        if (how === 'downloaded') toast('Saved to your downloads', 'good');
      }
      onShared?.();
      cleanupExport();
    } catch {
      failExport('Could not finish the clip');
    }
  }, [cleanupExport, failExport, onShared]);

  if (!scriptProp && !frames?.length) return null;

  // Remix re-rolls the look of a director-cut reel; a prebuilt script has nothing to re-roll. It
  // replays the new cut from the top (see the ReelPlayer key below), so a lingering pause would just
  // look like Remix "didn't work" — clear it here too.
  const remix = (): void => {
    setPreviewPaused(false);
    setReel((s) => (s ? reseedFinishes(s, s.seed + 1) : s));
  };

  return (
    <div
      className="shm-scrim"
      role="presentation"
      onClick={busy ? undefined : (e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="shm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share this conversation as a video"
      >
        {/* Two pressed-state toggles, not ARIA tabs: tab roles promise Left/Right switching and a
            linked tabpanel, and the reel "panel" is a pair of sibling columns with no single
            wrapper to label. aria-pressed is the pattern the rest of the app's two-way switches use. */}
        {frames?.length ? (
          <div className="shm-tabs" role="group" aria-label="Video style">
            <button
              type="button"
              aria-pressed={mode === 'conversation'}
              disabled={busy}
              onClick={() => setMode('conversation')}
            >
              Conversation
            </button>
            <button
              type="button"
              aria-pressed={mode === 'reel'}
              disabled={busy}
              onClick={() => setMode('reel')}
            >
              Reel
            </button>
          </div>
        ) : null}
        {mode === 'conversation' && frames?.length ? (
          <Suspense
            fallback={
              <div className="shm-composing" role="status">
                <span className="shm-composing-dot" />
                Opening…
              </div>
            }
          >
            <ConversationVideoStudio
              frames={frames}
              retainedAudio={retainedAudio}
              onShared={onShared}
              onBusyChange={setConversationBusy}
              frameRef={(element) => {
                frameElRef.current = element;
              }}
            />
          </Suspense>
        ) : (
          <>
            {/* left: controls */}
            <div className="shm-panel">
              <div className="shm-eyebrow">▷ MAVÉA REEL</div>
              <div className="shm-headline">
                {/* "about" until the exact narration timings are known (see exactSeconds above) — the
                 *  director's estimate is honest as a ballpark, not as a precise-looking number. */}
                Your session, as{exactSeconds ? '' : ' about'} a{' '}
                <span style={{ color: 'var(--presence-soft)' }}>
                  {seconds ? `${seconds}-second` : ''}
                </span>{' '}
                clip.
              </div>
              <div className="shm-sub">
                Auto-cut locally from the conversation and rendered in this browser. Narration uses
                the local Kokoro voice service; sharing sends only the finished video file to the
                destination you choose.
              </div>
              <FeatureUseNotice kind="publishing" from="live" />

              {shown && !recording && (
                <div className="shm-kbd-hint" aria-hidden="true">
                  <kbd>←</kbd>
                  <kbd>→</kbd> beats · <kbd>↑</kbd>
                  <kbd>↓</kbd> sections · <kbd>space</kbd> pause
                </div>
              )}

              <div className="shm-group">
                <div className="shm-label">Palette</div>
                <div className="shm-chips">
                  {PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="shm-chip"
                      data-active={palette === p.id}
                      aria-pressed={palette === p.id}
                      disabled={busy}
                      onClick={() => {
                        setPalette(p.id);
                      }}
                      title={p.blurb}
                    >
                      <span className="shm-dot" style={{ background: p.dot }} aria-hidden="true" />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="shm-group">
                <div className="shm-label">Format</div>
                <div className="shm-chips">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="shm-chip"
                      data-active={aspect === f.id}
                      aria-pressed={aspect === f.id}
                      disabled={busy}
                      onClick={() => {
                        setAspect(f.id);
                      }}
                    >
                      <span
                        className="shm-shape"
                        style={{ width: f.w, height: f.h }}
                        aria-hidden="true"
                      />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="shm-group">
                <div className="shm-label">Quality</div>
                <div className="shm-chips">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      className="shm-chip"
                      data-active={quality === q.id}
                      aria-pressed={quality === q.id}
                      disabled={busy}
                      onClick={() => {
                        setQuality(q.id);
                      }}
                      title={qualityHint(q.id)}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="shm-actions">
                <button
                  type="button"
                  className="shm-btn shm-btn-primary"
                  disabled={busy || !shown}
                  onClick={() => exportClip('share')}
                >
                  {busy ? <span className="shm-spin" aria-hidden="true" /> : '⤴'}
                  {busy ? phaseLabel : 'Share'}
                </button>
                <button
                  type="button"
                  className="shm-btn"
                  disabled={busy || !shown}
                  onClick={() => exportClip('download')}
                >
                  ↓ Download
                </button>
                <button
                  type="button"
                  className="shm-remix"
                  {...remixIntent}
                  disabled={busy || !reel || !!scriptProp}
                  onClick={remix}
                  title="Re-roll the look (same content, free)"
                >
                  ↻ Remix
                </button>
              </div>

              {/* Live render progress so the modal never looks frozen — and, after a failure, the
                  reason it stopped, so the toast isn't the only trace. Permanently in the a11y tree
                  (a live region added at announce time is unreliably dropped); the row collapses to
                  height 0 when idle, and its idle text is a single space, so it says nothing then. */}
              <div
                className="shm-progress"
                data-on={busy || phase === 'error'}
                data-error={phase === 'error'}
                role="status"
              >
                <div className="shm-progress-bar">
                  <i />
                </div>
                <span className="shm-progress-text">{phaseLabel || ' '}</span>
              </div>
            </div>

            {/* right: live reel preview (frame follows the chosen aspect) */}
            <div className="shm-stage">
              <div className="shm-frame" data-aspect={aspect}>
                {shown ? (
                  <ReelPlayer
                    // The seed is in the key so Remix (which bumps it) remounts the preview and replays
                    // the freshly re-rolled reel from the top — making the new looks immediately obvious.
                    // The synced/rough flag does the same the one time the exact timings arrive: it remounts
                    // so playback restarts in step with the narration (which itself restarts on the same
                    // toggle) rather than adopting the new pacing mid-beat; it never flips back afterward, so
                    // it doesn't remount again on every unrelated re-render. (Shared with the focus effect
                    // above, so "a fresh node exists" and "we know to refocus it" can never drift apart.)
                    key={reelKey}
                    script={shown}
                    timings={recording ? recTimingsRef.current : (previewTimings ?? undefined)}
                    loop={!recording}
                    playing={recording ? recPlaying : true}
                    playKey={recording ? 0 : previewKey}
                    paused={recording ? undefined : previewPaused}
                    onPausedChange={recording ? undefined : onPreviewPausedChange}
                    initialIndex={
                      !recording && shown.seed > 0
                        ? Math.max(
                            0,
                            shown.slides.findIndex(
                              (s) => s.content !== 'title' && s.content !== 'outro',
                            ),
                          )
                        : 0
                    }
                    interactive={!recording}
                    onCycle={() => {
                      if (soundOnRef.current) previewAudioRef.current?.play();
                    }}
                    frameRef={(el) => {
                      frameElRef.current = el;
                      if (el) setFrameReady(true);
                    }}
                    onDone={recording ? onRecordDone : undefined}
                  />
                ) : null}
                {shown && !recording && (
                  <div className="shm-controls">
                    <button
                      type="button"
                      className="shm-sound"
                      data-on={soundOn}
                      onClick={toggleSound}
                      disabled={soundLoading}
                      aria-pressed={soundOn}
                      title={soundOn ? 'Mute preview' : 'Play sound'}
                    >
                      {soundLoading ? (
                        <span className="shm-spin" aria-hidden="true" />
                      ) : soundOn ? (
                        <Icon.speaker style={{ width: 18, height: 18 }} />
                      ) : (
                        <Icon.speakerOff style={{ width: 18, height: 18 }} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="shm-sound"
                      data-on={previewPaused}
                      onClick={() => onPreviewPausedChange(!previewPaused)}
                      aria-pressed={previewPaused}
                      title={previewPaused ? 'Play' : 'Pause'}
                    >
                      {previewPaused ? (
                        <Icon.play style={{ width: 17, height: 17 }} />
                      ) : (
                        <Icon.pause style={{ width: 17, height: 17 }} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="shm-sound"
                      onClick={replayPreview}
                      title="Replay from the start"
                    >
                      <Icon.refresh style={{ width: 17, height: 17 }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Disabled rather than silently inert while a render is in flight — a live-looking Close
            that swallows clicks is exactly the wrong feedback during the longest wait. */}
        <button
          type="button"
          className="shm-close"
          onClick={busy ? undefined : onClose}
          disabled={busy}
          title={busy ? 'Finishing the export…' : undefined}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
