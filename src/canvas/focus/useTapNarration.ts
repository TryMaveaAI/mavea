// The brain behind a Focus-mode filmstrip tap. Every tap responds INSTANTLY (hush + take the wheel +
// move the spotlight), but the spoken line is DEBOUNCED — so brushing past five cards speaks ONE
// line, about the card you land on, instead of a stammer of cut-off half-lines. (The old path fired
// cancelSpeech()+speak() on every tap; a rapid scrub became a burst of tight cancel→speak that the
// browser's speech engine garbles — see voice/WebSpeechVoice.ts.) Tapping the card Mavéa is already on
// hushes it (tap again to replay). A new answer (`resetKey`) invalidates a pending line so it can
// never speak about a card from the previous answer.
//
// The two surfaces (Demo / Live) aren't symmetric — different speak engines, different ways to quiet
// the running tour, only Live has a live spotlight — so the timing logic lives here once and each
// surface injects its primitives through `ops`.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block } from '../../data/conversation';

/** How long after the last tap we wait before speaking. Below the ~250ms "feels instant" threshold (a
 *  single deliberate tap isn't laggy) yet long enough to coalesce a fast scrub, and well under the
 *  hero crossfade (SWAP_MS=560) so the line lands as the card settles onto the stage. */
const SETTLE_MS = 200;

/** A rough spoken-duration estimate so the "describing this" indicator clears on its own, without
 *  polling the speech engine (which Chrome reports unreliably across a cancel→speak gap). ~165 wpm
 *  plus a little padding, capped so it never sticks on. */
function estimateSpeechMs(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(8000, 700 + words * 360);
}

export interface TapNarrationOps {
  /** Quiet the running auto-tour / scripted captions so they can't speak over the pick. */
  takeWheel(): void;
  /** Hard-stop any in-flight speech — the SINGLE cancel (the settle delay is the cancel→speak gap). */
  hush(): void;
  /** Move the real spotlight to the picked block (Live); a no-op where there is none (Demo). */
  moveSpot(block: Block): void;
  /** Whether Mavéa may speak right now (sound on / not muted). */
  canSpeak(): boolean;
  /** The line to speak for a block — the model's own tour line when it has one, else a derived line,
   *  or null when the card has nothing meaningful to say (then it pins silently). */
  lineFor(block: Block): string | null;
  /** Speak a resolved line (the surface owns which engine + arming the mic echo gate). */
  speakLine(line: string): void;
}

export interface TapNarration {
  /** Take the wheel on a filmstrip tap: hush + pin/spotlight instantly, then speak once on settle. */
  narrate: (block: Block) => void;
  /** The block Mavéa is currently narrating (drives the "describing this" indicator), or null. */
  narratingId: string | null;
}

export function useTapNarration(ops: TapNarrationOps, resetKey: unknown): TapNarration {
  // Read the latest ops at call time so `narrate` stays referentially stable (no dep thrash on the
  // FocusStage tap handler) and never closes over stale surface state.
  const opsRef = useRef(ops);
  opsRef.current = ops;

  const [narratingId, setNarratingId] = useState<string | null>(null);
  // A ref mirror so the stable `narrate` callback can read the current value synchronously.
  const narratingIdRef = useRef<string | null>(null);
  const setNarrating = useCallback((id: string | null) => {
    narratingIdRef.current = id;
    setNarratingId(id);
  }, []);

  // One live timer for the deferred speak, one for clearing the indicator; only ever one of each.
  const speakTimer = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);
  const indicatorTimer = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);
  const clearTimers = useCallback(() => {
    if (speakTimer.current !== undefined) clearTimeout(speakTimer.current);
    if (indicatorTimer.current !== undefined) clearTimeout(indicatorTimer.current);
    speakTimer.current = undefined;
    indicatorTimer.current = undefined;
  }, []);

  const narrate = useCallback(
    (block: Block) => {
      const o = opsRef.current;
      const id = block.id ?? null;

      // Instant on every tap: take the wheel and move the real spotlight. Debouncing these would let
      // the Live auto-tour speak a beat line in the gap (double-speak); the hero/pin already updated
      // synchronously in FocusStage, so visuals never wait on the settle.
      o.takeWheel();
      o.moveSpot(block);

      // Tap the card Mavéa is currently on → hush it (tap again to replay). Cheap, reliable "be quiet".
      if (id && id === narratingIdRef.current) {
        o.hush();
        clearTimers();
        setNarrating(null);
        return;
      }

      // The single cancel. The SETTLE_MS before the deferred speak IS the cancel→speak settle the
      // browser needs, so a rapid scrub never recreates the tight cancel→speak burst.
      o.hush();
      clearTimers();

      const line = id ? o.lineFor(block) : null;
      if (!line || !o.canSpeak()) {
        // Content-less card (or muted): it still took the stage in FocusStage — stay silent rather
        // than blurt a lone noun, and leave no orphan timer behind.
        setNarrating(null);
        return;
      }

      setNarrating(id);
      speakTimer.current = setTimeout(() => {
        speakTimer.current = undefined;
        opsRef.current.speakLine(line);
        indicatorTimer.current = setTimeout(() => {
          indicatorTimer.current = undefined;
          if (narratingIdRef.current === id) setNarrating(null);
        }, estimateSpeechMs(line));
      }, SETTLE_MS);
    },
    [clearTimers, setNarrating],
  );

  // Cleanup runs on unmount AND before each `resetKey` change: a pending line never speaks about a
  // card from a previous answer, and no timer outlives the component (leak-free).
  useEffect(() => {
    return () => {
      clearTimers();
      setNarrating(null);
    };
  }, [resetKey, clearTimers, setNarrating]);

  return { narrate, narratingId };
}
