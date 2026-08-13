// React hook that owns the active VoiceController. Given a mode it instantiates the right
// controller, exposes its capabilities, and wires onResult/onStateChange through stable
// subscriptions: the caller's callbacks live in refs, so swapping the controller never
// asks the consumer to re-pass handlers and re-renders don't churn the subscriptions. The
// old controller is disposed on unmount. Voice capture is always the local Silero + Whisper path.
import { useEffect, useMemo, useRef } from 'react';
import { VadVoice } from './VadVoice';
import type {
  VoiceCapabilities,
  VoiceController,
  VoiceMode,
  VoiceResult,
  VoiceStartContext,
  VoiceStateEvent,
} from './types';

export interface UseVoiceControllerArgs {
  /** Kept explicit so the call site documents that capture is local. */
  mode?: VoiceMode;
  onResult?: (r: VoiceResult) => void;
  onStateChange?: (e: VoiceStateEvent) => void;
  /** VAD mode only: called the instant the VAD detects speech during TTS playback so the
   *  surface can cancel audio immediately before transcription even completes. */
  onBargeIn?: () => void;
}

export interface UseVoiceControllerReturn {
  mode: VoiceMode;
  capabilities: VoiceCapabilities;
  start: (ctx?: VoiceStartContext) => void;
  stop: () => void;
  speak: VoiceController['speak'];
  cancel: () => void;
  setMuted: (muted: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  /** Tell the active controller whether Mavéa is speaking, so an always-on mic can suppress its
   *  own TTS echo. No-op for controllers that don't implement it. */
  setMaveaSpeaking: (speaking: boolean) => void;
  /** Immediately stop and submit whatever was recorded — for press-and-hold PTT release.
   *  No-op for controllers that don't implement it. */
  forceStop: () => void;
}

function createController(): VoiceController {
  return new VadVoice();
}

export function useVoiceController(args: UseVoiceControllerArgs = {}): UseVoiceControllerReturn {
  // Hold the consumer callbacks in refs: the controller subscribes once per instance and
  // reads the latest handler at call time, so re-renders don't churn subscriptions and the
  // caller doesn't have to memoize its handlers.
  const onResultRef = useRef(args.onResult);
  const onStateRef = useRef(args.onStateChange);
  const onBargeInRef = useRef(args.onBargeIn);
  onResultRef.current = args.onResult;
  onStateRef.current = args.onStateChange;
  onBargeInRef.current = args.onBargeIn;

  // One controller instance for the surface. useMemo keeps it across re-renders; the effect below
  // disposes it on unmount.
  const controller = useMemo(() => createController(), []);

  useEffect(() => {
    const unsubResult = controller.onResult((r) => onResultRef.current?.(r));
    const unsubState = controller.onStateChange((e) => onStateRef.current?.(e));
    // Wire barge-in callback for VAD mode — called the moment the VAD hears the user
    // speaking over Mavéa so the surface can cancel TTS before transcription completes.
    if ('onBargeIn' in controller) {
      (controller as VadVoice).onBargeIn = () => onBargeInRef.current?.();
    }
    return () => {
      unsubResult();
      unsubState();
      controller.dispose();
    };
  }, [controller]);

  // Stable facade — methods delegate to the current controller. Recomputed only
  // when the controller swaps, so callers can safely depend on these refs.
  return useMemo<UseVoiceControllerReturn>(
    () => ({
      mode: controller.mode,
      capabilities: controller.capabilities,
      start: (ctx) => controller.start(ctx),
      stop: () => controller.stop(),
      speak: (opts) => controller.speak(opts),
      cancel: () => controller.cancel(),
      setMuted: (muted) => controller.setMuted(muted),
      setSoundEnabled: (enabled) => controller.setSoundEnabled(enabled),
      setMaveaSpeaking: (speaking) => controller.setMaveaSpeaking?.(speaking),
      forceStop: () => controller.forceStop?.(),
    }),
    [controller],
  );
}
