// ReplayOverlay.tsx — scroll back through the conversation and replay any moment.
//
// The live canvas clears or merges as a conversation moves, so a turn's visuals can vanish.
// Every turn is captured as a TurnFrame (see history.ts); this overlay is the way back: a
// timeline of turns on the left, the exact canvas of the selected turn on the right, and
// replay controls that re-narrate + re-spotlight a moment using the SAME choreography the
// live turn used (replay.ts → liveTourBeats). The user can replay one answer, from the
// start, or from a chosen point onward.
//
// Self-contained: it owns its selection, its spotlight, and its player loop, and tears the
// player down on unmount or when the user navigates — so audio + timers never leak.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { TopicCanvas } from '../canvas';
import { AnnotationLayer, type InkRequest } from './annotate/AnnotationLayer';
import type { TurnFrame } from './history';
import { replaySequence, type ReplaySegment } from './replay';
import { useFocusTrap } from './useFocusTrap';
import './replay-overlay.css';
import { sentenceCase } from '../lib/sentenceCase';

interface ReplayOverlayProps {
  frames: TurnFrame[];
  /** Which frame to open on. */
  initialIndex: number;
  /** Speak a line (wired to the surface's TTS; respects mute there). */
  speak?: (text: string) => void;
  /** Stop any in-flight speech (called before each segment + on teardown). */
  cancelSpeak?: () => void;
  onClose: () => void;
}

/** A short pause between replayed segments so a from-start playback reads as distinct turns. */
const SEGMENT_GAP_MS = 700;

export function ReplayOverlay({
  frames,
  initialIndex,
  speak,
  cancelSpeak,
  onClose,
}: ReplayOverlayProps): ReactElement | null {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), frames.length - 1));
  // The spotlight + the canvas currently on screen while replaying. When not playing, the
  // canvas is just the selected frame and nothing is spotlit.
  const [spot, setSpot] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [inked, setInked] = useState<InkRequest[]>([]);
  // The spec shown right now: during playback it follows the playing segment; otherwise the
  // selected frame's canvas.
  const [liveSpec, setLiveSpec] = useState(() => frames[initialIndex]?.spec ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Cancels an in-flight player loop (timers + the "still playing" guard).
  const cancelRef = useRef<(() => void) | null>(null);

  const frame = frames[index] ?? null;

  // Stop any running playback: clear its timers, drop the spotlight, leave the canvas put.
  const stop = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    cancelSpeak?.();
    setPlaying(false);
    setSpot(null);
    setInked([]);
  }, [cancelSpeak]);

  // Leaving the overlay always tears the player down first, however the user leaves.
  const close = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  // Board-grade modal behavior, matching the other Live overlays: keyboard focus stays inside the
  // dialog, Escape closes it, and focus returns to whatever opened it.
  useFocusTrap(dialogRef, { onEscape: close });

  // Play a list of segments in order: render each segment's canvas, highlight its turn in the
  // timeline, speak its line, walk its spotlight beats, then advance. `fromFrame` is the frame
  // index the first segment corresponds to, so the timeline tracks playback. Fully cancellable.
  const play = useCallback(
    (segments: ReplaySegment[], fromFrame: number) => {
      stop();
      if (!segments.length) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      cancelRef.current = () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
      setPlaying(true);

      let segIdx = 0;
      const runSegment = (): void => {
        if (cancelled) return;
        if (segIdx >= segments.length) {
          setPlaying(false);
          setSpot(null);
          return;
        }
        const seg = segments[segIdx];
        // Reflect this segment's turn in the timeline + canvas, and narrate it.
        setIndex(fromFrame + segIdx);
        setLiveSpec(seg.spec);
        setInked([]);
        cancelSpeak?.();
        if (seg.say) speak?.(seg.say);

        let beatIdx = 0;
        const runBeat = (): void => {
          if (cancelled) return;
          if (beatIdx >= seg.beats.length) {
            segIdx += 1;
            timer = setTimeout(runSegment, SEGMENT_GAP_MS);
            return;
          }
          const beat = seg.beats[beatIdx++];
          if (beat.set && 'spot' in beat.set) {
            const nextSpot = beat.set.spot ?? null;
            setSpot(nextSpot);
            const cue = nextSpot ? seg.cues.find((item) => item.spot === nextSpot) : undefined;
            if (cue?.marks.length) {
              setInked((current) => [
                ...current,
                ...cue.marks.map((mark, markIndex) => ({
                  spot: cue.spot,
                  line: cue.say,
                  mark,
                  delayMs: markIndex * 240,
                  ...(mark.kind === 'connect' && typeof mark.onIndex === 'number'
                    ? { toSpot: seg.spec.blocks[mark.onIndex]?.id }
                    : {}),
                })),
              ]);
            }
          }
          timer = setTimeout(runBeat, beat.ms ?? 0);
        };
        runBeat();
      };
      runSegment();
    },
    [stop, speak, cancelSpeak],
  );

  // Replay just the selected turn.
  const replayOne = useCallback(() => {
    if (!frame) return;
    play(replaySequence([frame], 0), index);
  }, [frame, index, play]);

  // Replay from the selected turn through the end of the conversation.
  const replayFromHere = useCallback(() => {
    play(replaySequence(frames, index), index);
  }, [frames, index, play]);

  // Replay the whole conversation from the first turn.
  const replayAll = useCallback(() => {
    setIndex(0);
    play(replaySequence(frames, 0), 0);
  }, [frames, play]);

  // When the user picks a different turn (and isn't mid-playback), show that frame's canvas.
  const select = useCallback(
    (i: number) => {
      stop();
      setIndex(i);
      setLiveSpec(frames[i]?.spec ?? null);
    },
    [frames, stop],
  );

  // Glide the spotlit block to center during playback (mirrors the live surface).
  useEffect(() => {
    if (!spot) return;
    const id = window.setTimeout(() => {
      const cont = scrollRef.current;
      if (!cont) return;
      const el = cont.querySelector('.spotlit');
      if (!el) return;
      const cRect = cont.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const delta = eRect.top - cRect.top - (cont.clientHeight - eRect.height) / 2;
      cont.scrollTo({ top: Math.max(0, cont.scrollTop + delta), behavior: 'smooth' });
    }, 90);
    return () => window.clearTimeout(id);
  }, [spot]);

  // Tear the player down on unmount so no timer or speech outlives the overlay.
  useEffect(() => () => stop(), [stop]);

  if (!frame || !liveSpec) return null;

  return (
    // The scrim's only job is the backdrop click; it carries no role of its own, so the dialog
    // below is what assistive tech announces (a role="button" wrapper around every control would
    // read as one giant button with buttons nested inside it).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="replay-scrim" onClick={close}>
      {/* Clicks inside the dialog are swallowed so they don't bubble to the scrim and close it —
          a propagation guard, not a click affordance, so it has no keyboard twin. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="replay-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Replay"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Timeline — every turn, click to view; the live canvas is on the right. */}
        <div className="replay-timeline">
          <div className="replay-timeline-head">
            <span>Conversation</span>
            <button className="entry-action" style={{ fontSize: 12 }} onClick={close}>
              ← Live
            </button>
          </div>
          {frames.map((f, i) => (
            <button
              key={i}
              className={'replay-turn' + (i === index ? ' is-active' : '')}
              onClick={() => select(i)}
              title={f.question && sentenceCase(f.question)}
            >
              <span className="replay-turn-title">
                {i + 1}. {sentenceCase(f.question || f.spec.title)}
              </span>
              <span className="replay-turn-meta">
                {f.spec.blocks.length} cards
                {f.mode !== 'replace' ? ` · ${f.mode}` : ''}
              </span>
            </button>
          ))}
        </div>

        {/* The selected (or playing) canvas + replay controls. */}
        <div className="replay-main">
          <div className="replay-bar">
            <span className="faint replay-bar-title">{frame.spec.title}</span>
            {playing ? (
              <button className="entry-action" onClick={stop}>
                ◼ Stop
              </button>
            ) : (
              <>
                <button className="entry-action" onClick={replayOne}>
                  ▶ Replay this
                </button>
                <button className="entry-action" onClick={replayFromHere}>
                  ▶ From here
                </button>
                <button className="entry-action" onClick={replayAll}>
                  ▶ From start
                </button>
              </>
            )}
          </div>
          <div ref={scrollRef} className="canvas-scroll replay-canvas">
            <div className="topic-wrap">
              <TopicCanvas data={liveSpec} spot={spot} built={{}} onProve={() => {}} />
            </div>
            <AnnotationLayer spots={inked} within={scrollRef.current} revision={index} />
          </div>
        </div>
      </div>
    </div>
  );
}
