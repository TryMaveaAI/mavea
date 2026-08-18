import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { prefersReducedMotion } from '../../canvas/focus/motion';
import { Icon } from '../../icons/icons';
import type { TurnFrame } from '../../live/history';
import { turnFrameId } from '../../live/history';
import type { TurnAudio } from '../../live/scrubvoice/recorder';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import { toast } from '../../lib/toast';
import { clipFileName, downloadClip, videoFileBase } from '../share';
import { qualityHint } from '../capture';
import type { ClipQuality } from '../types';
import { prepareConversationAudio, RequiredConversationAudioError } from './audio';
import {
  CONVERSATION_DIMENSIONS,
  conversationCaptureSupported,
  exportConversationVideo,
} from './capture';
import { ConversationStage } from './ConversationStage';
import {
  buildConversationTimeline,
  CONVERSATION_VIDEO_MAX_MS,
  currentTopicStart,
  estimateConversationDurationMs,
  estimateTurnAudio,
  estimateTurnDurationMs,
} from './timeline';
import type {
  ConversationExportProgress,
  ConversationExportResult,
  ConversationScene,
  ConversationTurnAudio,
  ConversationVideoOptions,
  ConversationVideoSize,
} from './types';
import './video-studio.css';

// A conversation cut is plain screen video, not a social reel — familiar 16:9 resolutions only.
const SIZES: { id: ConversationVideoSize; label: string; hint: string }[] = [
  { id: '1080p', label: '1080p', hint: '1920×1080' },
  { id: '720p', label: '720p', hint: '1280×720' },
];

const QUALITIES: { id: ClipQuality; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

/** The preview never lingers under this, so short caption beats stay readable while it plays. */
const PREVIEW_MIN_SCENE_MS = 650;

/** The export monitor's raster. The sheet's 16:9 frame is at most 548 CSS px wide, so this covers
 *  it without asking the recorder to hand over a second full-size copy of every frame. */
const MONITOR_WIDTH = 640;
const MONITOR_HEIGHT = 360;

/**
 * Wait for a commit to have been painted. Two frames is the reliable signal — but rAF stops firing
 * altogether in an occluded or backgrounded window, so every wait races a timeout. A bare
 * `await requestAnimationFrame` here is unrecoverable rather than merely slow: nothing downstream
 * is watching the abort signal yet, so the export hangs on "Preparing required narration…" with a
 * Cancel button that cannot cancel it, until the window is brought back to the front.
 */
function settled(budgetMs = 300): Promise<void> {
  return Promise.race([
    (async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    })(),
    new Promise<void>((resolve) => window.setTimeout(resolve, budgetMs)),
  ]);
}

const OPTION_LABELS: {
  key: keyof Omit<ConversationVideoOptions, 'size' | 'quality'>;
  label: string;
}[] = [
  { key: 'captions', label: 'Captions' },
  { key: 'spotlights', label: 'Spotlights' },
  { key: 'penMarks', label: 'Pen marks' },
  { key: 'presence', label: 'Mavéa' },
  { key: 'audio', label: 'Audio' },
];

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1_000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Show the stage at its real output size, scaled to fit the frame — the preview and the encoder
 * then rasterize an identical layout. Sizing the preview stage to the modal instead made it a
 * different render entirely: the canvas hit its narrow breakpoints, so the preview under-sold a
 * 1920px export and mis-sold where the text would break.
 */
function StageScaler({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}): ReactElement {
  const boxRef = useRef<HTMLDivElement | null>(null);
  // 0 until measured — the unscaled stage is far larger than the frame, so painting it before the
  // first measurement would flash a giant crop.
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = (): void => {
      const { width: available, height: tall } = box.getBoundingClientRect();
      if (!available || !tall) return;
      setScale(Math.min(available / width, tall / height));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div ref={boxRef} className="cvs-viewport">
      <div
        className="cvs-scaler"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          visibility: scale ? undefined : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function previewAudio(frames: readonly TurnFrame[]): ConversationTurnAudio[] {
  return frames.map((frame) => {
    const durationMs = estimateTurnDurationMs(frame);
    return {
      durationMs,
      spans: [
        {
          text: frame.narration,
          startMs: 650,
          endMs: Math.max(651, durationMs - 350),
        },
      ],
    };
  });
}

export function ConversationVideoStudio({
  frames,
  retainedAudio,
  onShared,
  onBusyChange,
}: {
  frames: TurnFrame[];
  retainedAudio?: (frame: TurnFrame) => TurnAudio | null;
  onShared?: () => void;
  onBusyChange?: (busy: boolean) => void;
}): ReactElement {
  const available = useMemo(
    () =>
      frames.filter((frame) =>
        Boolean(
          (frame.spoken ?? frame.narration).trim() ||
          frame.tour.some((t) => (t.saySpoken ?? t.say)?.trim()),
        ),
      ),
    [frames],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(available.length ? [turnFrameId(available[available.length - 1])] : []),
  );
  const availableIds = useMemo(() => new Set(available.map(turnFrameId)), [available]);
  const [options, setOptions] = useState<ConversationVideoOptions>({
    size: '1080p',
    quality: 'high',
    captions: true,
    spotlights: true,
    penMarks: true,
    presence: true,
    audio: true,
  });
  const selectedFrames = useMemo(
    () => frames.filter((frame) => selected.has(turnFrameId(frame))),
    [frames, selected],
  );
  const estimatedMs = useMemo(
    () => estimateConversationDurationMs(selectedFrames),
    [selectedFrames],
  );
  const previewScenes = useMemo(
    () => buildConversationTimeline(selectedFrames, previewAudio(selectedFrames), options),
    [selectedFrames, options],
  );
  const [scene, setScene] = useState<ConversationScene | null>(() => previewScenes[0] ?? null);
  const [progress, setProgress] = useState<ConversationExportProgress | null>(null);
  const [result, setResult] = useState<ConversationExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureMounted, setCaptureMounted] = useState(false);
  // The preview canvas is a full TopicCanvas render — deferring it one commit lets the studio's
  // controls paint immediately instead of blocking the modal's first frame on the heaviest child.
  const [stageReady, setStageReady] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [renderPaused, setRenderPaused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<ConversationExportResult | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const turnsRef = useRef<HTMLDivElement | null>(null);
  const monitorRef = useRef<HTMLCanvasElement | null>(null);
  const busy = progress !== null && progress.phase !== 'ready';
  // Once frames are being rendered, the preview stops being a second live 1080p stage and becomes a
  // monitor fed by the capture itself — one tree rendering during the export instead of two. The
  // narration phase keeps the real preview: nothing is being captured yet to show.
  const monitoring = busy && progress?.phase !== 'audio';
  const canCapture = conversationCaptureSupported();
  const reduceMotion = useMemo(() => prefersReducedMotion(), []);
  // Only a preview that actually moves needs a pause affordance (WCAG 2.2.2); a held still doesn't.
  const previewPlays = stageReady && !busy && !reduceMotion && previewScenes.length > 1;

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  // A hidden window can't paint, so the recorder deliberately holds the scene timeline until it
  // comes back (capture.ts). Say so: without this the export sits on "Rendering scene 1 of N…"
  // indefinitely, which reads as a crash rather than a pause the user can end by switching back.
  useEffect(() => {
    if (!busy) {
      setRenderPaused(false);
      return;
    }
    const sync = (): void => setRenderPaused(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [busy]);
  useEffect(() => setStageReady(true), []);
  // The preview PLAYS the selected cut. A static first frame is the dimmed question beat, which
  // reads as broken; instead the stage steps through the real scene timeline and loops. Under
  // reduced motion it holds one still — the first CONTENT beat, so it still reads as the real cut.
  useEffect(() => {
    const start = reduceMotion ? previewScenes.findIndex((beat) => !beat.questionOnly) : 0;
    setPreviewIndex(Math.max(0, start));
    setPreviewPaused(false);
  }, [previewScenes, reduceMotion]);
  useEffect(() => {
    if (!busy) setScene(previewScenes[previewIndex] ?? previewScenes[0] ?? null);
  }, [previewScenes, previewIndex, busy]);
  useEffect(() => {
    if (!previewPlays || previewPaused) return;
    const current = previewScenes[previewIndex] ?? previewScenes[0];
    const id = window.setTimeout(
      () => setPreviewIndex((index) => (index + 1) % previewScenes.length),
      Math.max(PREVIEW_MIN_SCENE_MS, current?.durationMs ?? PREVIEW_MIN_SCENE_MS),
    );
    return () => window.clearTimeout(id);
  }, [previewPlays, previewPaused, previewScenes, previewIndex]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      void resultRef.current?.dispose?.();
      resultRef.current = null;
      onBusyChange?.(false);
    },
    [onBusyChange],
  );
  // The turn list's bottom fade promises more rows below, so it only belongs on a list that
  // actually overflows — under one or two turns it read as a clipped render. Written straight to a
  // data attribute (video-studio.css keys off it) so a window resize never re-renders the sheet.
  useEffect(() => {
    const list = turnsRef.current;
    if (!list) return;
    const sync = (): void => {
      list.dataset.overflowing = String(list.scrollHeight > list.clientHeight + 1);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(list);
    return () => observer.disconnect();
  }, [frames]);

  const applyScene = useCallback(async (next: ConversationScene): Promise<void> => {
    setScene(next);
    await settled();
  }, []);

  const showFrame = useCallback((frame: HTMLCanvasElement) => {
    const monitor = monitorRef.current;
    const context = monitor?.getContext('2d');
    if (!monitor || !context) return;
    context.drawImage(frame, 0, 0, monitor.width, monitor.height);
  }, []);

  const clearResult = useCallback(() => {
    void resultRef.current?.dispose?.();
    resultRef.current = null;
    setResult(null);
    // The finished-render status goes with the file it described — otherwise changing a setting
    // leaves a "Video ready" pill next to a Create button, announcing a video that no longer exists.
    setProgress(null);
  }, []);

  const exportVideo = useCallback(async () => {
    if (!selectedFrames.length || estimatedMs > CONVERSATION_VIDEO_MAX_MS) return;
    const controller = new AbortController();
    abortRef.current = controller;
    clearResult();
    setError(null);
    // An audio-off export never touches the voice service, so its first visible phase is the render.
    setProgress(
      options.audio
        ? { phase: 'audio', completed: 0, total: selectedFrames.length }
        : { phase: 'render', completed: 1, total: 1 },
    );
    setCaptureMounted(true);
    try {
      // The offscreen capture host has just been mounted; give it a paint before reading its node.
      await settled();
      const captureStage = stageRef.current;
      if (!captureStage) throw new Error('capture-stage-unavailable');
      const audio = options.audio
        ? await prepareConversationAudio(
            selectedFrames,
            retainedAudio ?? (() => null),
            controller.signal,
          )
        : null;
      // With audio off (the cheap path — zero TTS requests) the character-count estimate that
      // already drives the meter becomes the clock, laid out per line so captions still pace.
      const turns = audio ? audio.turns : selectedFrames.map(estimateTurnAudio);
      const scenes = buildConversationTimeline(selectedFrames, turns, options);
      if (!scenes.length) throw new Error('empty-video');
      // `completed` reads as the ordinal of the scene being rendered (capture.ts reports index + 1
      // once each one lands), so the first, longest wait says "scene 1 of N", never "scene 0".
      setProgress({ phase: 'render', completed: 1, total: scenes.length });
      const clip = await exportConversationVideo({
        el: captureStage,
        scenes,
        audioBuffer: audio?.buffer ?? null,
        durationMs: audio?.durationMs ?? turns.reduce((sum, turn) => sum + turn.durationMs, 0),
        size: options.size,
        quality: options.quality,
        signal: controller.signal,
        applyScene,
        onProgress: setProgress,
        onFrame: showFrame,
      });
      resultRef.current = clip;
      setResult(clip);
      // The result card below IS the ready announcement; a progress pill saying the same thing
      // would just be the news twice, and would outlive the file once a setting changes.
      setProgress(null);
    } catch (caught) {
      if ((caught as DOMException)?.name === 'AbortError') {
        setProgress(null);
        return;
      }
      const message =
        caught instanceof RequiredConversationAudioError
          ? `${caught.message} Check the local voice service, then retry.`
          : caught instanceof Error && caught.message === 'conversation-too-long'
            ? 'The voiced result is over three minutes. Remove a turn and retry.'
            : caught instanceof Error && caught.message === 'open-codec-unavailable'
              ? 'This browser cannot encode an approved open-media format (AV1/VP9/VP8 with Opus). Try the current Chrome, Edge, or Firefox.'
              : 'The video could not be created in this browser. Your conversation is unchanged.';
      setError(message);
      setProgress(null);
    } finally {
      setCaptureMounted(false);
    }
  }, [applyScene, clearResult, estimatedMs, options, retainedAudio, selectedFrames, showFrame]);

  const choose = (next: TurnFrame[]) => {
    if (busy) return;
    setSelected(new Set(next.map(turnFrameId)));
    clearResult();
    setError(null);
  };

  const outputSize = CONVERSATION_DIMENSIONS[options.size];
  // Named after what it is, so a video that lands in a downloads folder among a hundred others is
  // still identifiable a week later — "mavea-conversation.webm" told you nothing.
  const downloadName = clipFileName(
    videoFileBase(selectedFrames[0]?.spec.title || selectedFrames[0]?.question, new Date()),
    result?.type ?? '',
  );
  const progressLabel = progress
    ? progress.phase === 'audio'
      ? 'Preparing required narration…'
      : progress.phase === 'render'
        ? `Rendering scene ${progress.completed} of ${progress.total}…`
        : progress.phase === 'encode'
          ? 'Finishing the file…'
          : 'Video ready'
    : '';
  const overLimit = estimatedMs > CONVERSATION_VIDEO_MAX_MS;

  return (
    <>
      <div className="shm-panel cvs-panel">
        <div className="shm-eyebrow">▷ CONVERSATION VIDEO</div>
        <div className="cvs-title">Share this conversation.</div>
        <div className="shm-sub">
          Pick the turns worth sending. Mavéa narrates every one unless Audio is off. The video
          renders locally in this browser and is never uploaded.
        </div>
        <FeatureUseNotice kind="publishing" from="live" />

        <div className="cvs-presets">
          <button type="button" onClick={() => choose(available.slice(-1))} disabled={busy}>
            Current turn
          </button>
          <button
            type="button"
            onClick={() =>
              choose(
                frames
                  .slice(currentTopicStart(frames))
                  .filter((frame) => availableIds.has(turnFrameId(frame))),
              )
            }
            disabled={busy}
          >
            Current topic
          </button>
          <button type="button" onClick={() => choose(available)} disabled={busy}>
            All turns
          </button>
        </div>

        <div className="cvs-turns" role="group" aria-label="Conversation turns" ref={turnsRef}>
          {frames.map((frame, index) => {
            const id = turnFrameId(frame);
            const hasAudio = availableIds.has(id);
            return (
              <label className="cvs-turn-card" data-selected={selected.has(id)} key={id}>
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  disabled={busy || !hasAudio}
                  onChange={() => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                    clearResult();
                  }}
                />
                <span className="cvs-thumb" aria-hidden="true">
                  {frame.spec.blocks.length}
                </span>
                <span className="cvs-turn-copy">
                  <strong>{frame.question || frame.spec.title}</strong>
                  <small>
                    {new Date(frame.at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {!hasAudio ? ' · no narration' : ''}
                  </small>
                </span>
                <span className="cvs-order">{index + 1}</span>
              </label>
            );
          })}
        </div>

        <div className="shm-group">
          <div className="shm-label">Size</div>
          <div className="shm-chips">
            {SIZES.map((size) => (
              <button
                type="button"
                className="shm-chip"
                data-active={options.size === size.id}
                aria-pressed={options.size === size.id}
                disabled={busy}
                onClick={() => {
                  clearResult();
                  setOptions((current) => ({ ...current, size: size.id }));
                }}
                title={size.hint}
                key={size.id}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>

        <div className="shm-group">
          <div className="shm-label">Quality</div>
          <div className="shm-chips">
            {QUALITIES.map((quality) => (
              <button
                type="button"
                className="shm-chip"
                data-active={options.quality === quality.id}
                aria-pressed={options.quality === quality.id}
                disabled={busy}
                onClick={() => {
                  clearResult();
                  setOptions((current) => ({ ...current, quality: quality.id }));
                }}
                title={qualityHint(quality.id)}
                key={quality.id}
              >
                {quality.label}
              </button>
            ))}
          </div>
        </div>

        <div className="shm-group">
          <div className="shm-label">Include</div>
          <div className="shm-chips">
            {OPTION_LABELS.map(({ key, label }) => (
              <button
                type="button"
                className="shm-chip"
                data-active={options[key]}
                aria-pressed={options[key]}
                disabled={busy}
                onClick={() => {
                  clearResult();
                  setOptions((current) => ({ ...current, [key]: !current[key] }));
                }}
                key={key}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="cvs-meter" data-over={overLimit}>
          <span>{formatDuration(estimatedMs)} selected</span>
          <span>3:00 max</span>
          <i
            style={{ width: `${Math.min(100, (estimatedMs / CONVERSATION_VIDEO_MAX_MS) * 100)}%` }}
          />
        </div>

        {error && (
          <div className="cvs-error" role="alert">
            {error}
          </div>
        )}
        {!canCapture && (
          <div className="cvs-error" role="alert">
            Video export needs an approved open video codec (AV1/VP9/VP8) and Opus audio. Try the
            current Chrome, Edge, or Firefox.
          </div>
        )}
        {progress && (
          <div className="cvs-progress" role="status">
            {progressLabel}
            {renderPaused && (
              <em className="cvs-paused">
                Paused while this window is in the background — come back to it and the render picks
                up where it left off.
              </em>
            )}
          </div>
        )}
        {result && (
          <div className="cvs-result" role="status">
            <strong>
              Ready · {result.width}×{result.height}
            </strong>
            <span>
              {formatDuration(result.durationMs)} · {(result.blob.size / 1_048_576).toFixed(1)} MB
            </span>
          </div>
        )}

        <div className="shm-actions">
          {result ? (
            <button
              type="button"
              className="shm-btn shm-btn-primary"
              onClick={() => {
                // Handing the blob over consumes it: downloadClip owns the disposal from here, so
                // the card and its buttons must go rather than linger over a file being freed.
                resultRef.current = null;
                downloadClip(result.blob, downloadName, () => void result.dispose?.());
                setResult(null);
                toast('Saved to your downloads', 'good');
                onShared?.();
              }}
            >
              ↓ Download video
            </button>
          ) : busy ? (
            <button type="button" className="shm-btn" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="shm-btn shm-btn-primary"
              disabled={!selectedFrames.length || overLimit || !canCapture}
              onClick={() => void exportVideo()}
            >
              {error ? `Retry ${options.size} video` : `Create ${options.size} video`}
            </button>
          )}
        </div>
      </div>

      <div className="shm-stage">
        <div className="shm-frame" data-aspect="16:9">
          {monitoring ? (
            <canvas
              ref={monitorRef}
              className="cvs-monitor"
              width={MONITOR_WIDTH}
              height={MONITOR_HEIGHT}
              role="img"
              aria-label="The frames being rendered"
            />
          ) : stageReady ? (
            <StageScaler width={outputSize.width} height={outputSize.height}>
              <ConversationStage scene={scene} options={options} glide={!reduceMotion} />
            </StageScaler>
          ) : (
            <div className="cvs-stage" data-aspect="16:9">
              <div className="cvs-empty" role="status">
                Preparing preview…
              </div>
            </div>
          )}
          {previewPlays && (
            <div className="shm-controls">
              <button
                type="button"
                className="shm-sound"
                data-on={previewPaused}
                onClick={() => setPreviewPaused((paused) => !paused)}
                aria-pressed={previewPaused}
                title={previewPaused ? 'Play preview' : 'Pause preview'}
              >
                {previewPaused ? (
                  <Icon.play style={{ width: 17, height: 17 }} />
                ) : (
                  <Icon.pause style={{ width: 17, height: 17 }} />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      {captureMounted && (
        // Offscreen and inert: a full canvas renders here during export, and `inert` keeps it out of
        // both the tab order and the accessibility tree — aria-hidden alone leaves it tabbable.
        <div className="cvs-capture-host" data-size={options.size} aria-hidden="true" inert>
          <ConversationStage
            scene={scene}
            options={options}
            frameRef={(element) => {
              stageRef.current = element;
            }}
          />
        </div>
      )}
    </>
  );
}
