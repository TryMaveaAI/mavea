// world/useWorldWalk — the walk's React state: which beat is on screen, whether it is playing, and
// the one line to caption. The loop itself is `runWorldWalk`, kept outside React so its pacing can
// be tested without a renderer.
//
// The generation token (`runRef`) is the whole trick. A walk is a long-lived async loop, and a
// reader who seeks, pauses, or simply grabs the world mid-flight leaves it suspended inside an
// `await` that will resolve LATER — after the state it was about to write stopped being true. Every
// start takes a number; the loop reads that number back through `isCancelled` after every wait, and
// its `onDone` refuses to touch state it no longer owns. Without it a stale walk resumes on top of
// a newer one and the two fight over the camera.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpokenLine } from '../../voice/tts';
import { runWorldWalk } from './worldWalk';
import type { WorldBeat } from './worldStory';

export interface UseWorldWalkOptions {
  beats: readonly WorldBeat[];
  /** Put the world into a beat. Called only once the beat's line is audible. */
  apply: (beat: WorldBeat, index: number) => void;
  /** The surface's voice, if it has one. Consulted per line, so muting mid-walk takes effect. */
  speakLine?: (text: string) => SpokenLine | null;
}

export interface WorldWalkApi {
  /** The beat on screen, or -1 before the walk has started. */
  index: number;
  playing: boolean;
  /** The current beat's shown line, or null while idle. */
  caption: string | null;
  /** Play from where we left off, or pause. */
  toggle: () => void;
  seek: (index: number) => void;
  /** Leave the walk entirely and forget where it was — what the reader's own gesture does, since
   *  they are now driving and a half-finished walk's caption describes a world they have moved on
   *  from. Pausing is `toggle`; this is leaving. */
  reset: () => void;
}

export function useWorldWalk({ beats, apply, speakLine }: UseWorldWalkOptions): WorldWalkApi {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const runRef = useRef(0);

  // Read-through refs (the motion.ts idiom) so `start` never re-creates as the world, the voice or
  // the beats change — a walk that re-subscribed mid-flight would cancel itself.
  const beatsRef = useRef(beats);
  beatsRef.current = beats;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const speakRef = useRef(speakLine);
  speakRef.current = speakLine;

  /** Halt the running loop at its next wait, leaving the beat on screen. */
  const halt = useCallback(() => {
    runRef.current += 1;
    setPlaying(false);
  }, []);

  const start = useCallback((from: number) => {
    const mine = (runRef.current += 1);
    setPlaying(true);
    runWorldWalk(
      beatsRef.current,
      from,
      {
        speakLine: (text) => speakRef.current?.(text) ?? null,
        apply: (beat, i) => {
          setIndex(i);
          applyRef.current(beat, i);
        },
        isCancelled: () => runRef.current !== mine,
      },
      () => {
        // A newer walk (or a stop) already owns the transport — leave its state alone.
        if (runRef.current !== mine) return;
        setPlaying(false);
      },
    );
  }, []);

  // A walk cannot outlive the surface: the loop holds timers and a speech handle, and its `apply`
  // writes state. Bumping the token on unmount ends it at its next wait.
  useEffect(() => () => void (runRef.current += 1), []);

  // The beats changed under us — the reader pulled a lever, expanded a cause, or the world evolved.
  // The old indices no longer mean what they meant, so the walk ends rather than narrating one
  // world's script over another's picture.
  useEffect(() => {
    runRef.current += 1;
    setPlaying(false);
    setIndex(-1);
  }, [beats]);

  const toggle = useCallback(() => {
    if (playing) {
      halt();
      return;
    }
    const count = beatsRef.current.length;
    if (count === 0) return;
    // Paused part-way resumes on the beat you paused on — the line restarts, because a line cannot
    // resume from its middle and a silent half-beat would be worse. At the end, play starts over.
    start(index >= 0 && index < count - 1 ? index : 0);
  }, [playing, index, start, halt]);

  const seek = useCallback(
    (to: number) => {
      const count = beatsRef.current.length;
      if (count === 0) return;
      start(Math.min(Math.max(to, 0), count - 1));
    },
    [start],
  );

  const reset = useCallback(() => {
    halt();
    setIndex(-1);
  }, [halt]);

  return {
    index,
    playing,
    caption: index >= 0 ? (beats[index]?.caption ?? null) : null,
    toggle,
    seek,
    reset,
  };
}
