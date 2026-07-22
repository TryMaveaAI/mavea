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
import type { TurnFrame } from './history';
import { replaySequence, type ReplaySegment } from './replay';

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
  // The spec shown right now: during playback it follows the playing segment; otherwise the
  // selected frame's canvas.
  const [liveSpec, setLiveSpec] = useState(() => frames[initialIndex]?.spec ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  }, [cancelSpeak]);

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
          if (beat.set && 'spot' in beat.set) setSpot(beat.set.spot ?? null);
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
    <div
      onClick={() => {
        stop();
        onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close replay overlay"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          stop();
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 60,
        display: 'flex',
        padding: 20,
        gap: 16,
      }}
    >
      {/* Timeline — every turn, click to view; the live canvas is on the right. */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{
          flex: '0 0 240px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflow: 'auto',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Conversation</span>
          <button
            className="entry-action"
            style={{ fontSize: 12 }}
            onClick={() => {
              stop();
              onClose();
            }}
          >
            ← Live
          </button>
        </div>
        {frames.map((f, i) => {
          const active = i === index;
          return (
            <button
              key={i}
              onClick={() => select(i)}
              title={f.question}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid ' + (active ? 'var(--presence)' : 'var(--line)'),
                background: active ? 'var(--surface-elevated)' : 'transparent',
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {i + 1}. {f.question || f.spec.title}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {f.spec.blocks.length} cards
                {f.mode !== 'replace' ? ` · ${f.mode}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* The selected (or playing) canvas + replay controls. */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: 12.5, marginRight: 'auto' }}>
            {frame.spec.title}
          </span>
          {playing ? (
            <button className="entry-action" style={{ fontSize: 13 }} onClick={stop}>
              ◼ Stop
            </button>
          ) : (
            <>
              <button className="entry-action" style={{ fontSize: 13 }} onClick={replayOne}>
                ▶ Replay this
              </button>
              <button className="entry-action" style={{ fontSize: 13 }} onClick={replayFromHere}>
                ▶ From here
              </button>
              <button className="entry-action" style={{ fontSize: 13 }} onClick={replayAll}>
                ▶ From start
              </button>
            </>
          )}
        </div>
        <div
          ref={scrollRef}
          className="canvas-scroll"
          style={{
            flex: 1,
            overflow: 'auto',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div className="topic-wrap">
            <TopicCanvas data={liveSpec} spot={spot} built={{}} onProve={() => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}
