// The input bar: mic button, a live "listening"/"heard" indicator, the text field,
// and send. Voice and typing both funnel through onSend, so the host treats them alike.
import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { Icon } from '../icons/icons';
import { ACCEPTED_TYPES } from '../live/attachments';

type MicInputMode = 'tap' | 'hold' | 'always';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: (v: string) => void;
  listening: boolean;
  onMic: () => void;
  /** Tap and Always use a click; Hold starts immediately on press and finishes on release. */
  micMode?: MicInputMode;
  /** An Always-on session can be armed between utterances without actively hearing speech. */
  micArmed?: boolean;
  /** Session-local pause; the saved Always-on preference remains selected. */
  micPaused?: boolean;
  /** Captured audio is being resolved; Tap/Hold cannot start a second overlapping capture. */
  micProcessing?: boolean;
  /** Hard-disable voice input (the scripted Demo's mute blocks its mic). This is about the
   *  USER's microphone only — muting Mavéa's voice output must never set it. */
  micDisabled?: boolean;
  placeholder?: string;
  disabled?: boolean;
  heard?: string | null;
  /** Increment to pull focus into the input on demand (e.g. when Live mode opens). */
  focusSignal?: number;
  /** Called with the files the user picked via the paperclip. When omitted, the attach
   *  button doesn't render (e.g. the scripted Demo composer, which has no upload path). */
  onFiles?: (files: File[]) => void;
  /** Increment to briefly pulse the attach button — drawing the eye to it when a feature (Prism)
   *  needs a document but none is attached yet. A signal, not boolean state, so repeat triggers
   *  re-fire even when the value would otherwise be unchanged. */
  attachPulse?: number;
  /** Tooltip for the attach button — defaults to "Attach a file". The button is never disabled:
   *  even a model with no vision can still explode an Office/text/data attachment (extracted
   *  client-side), so a reason to caveat belongs in this copy, not behind a disabled state. */
  attachTitle?: string;
  /** Called when a Hold-mode press starts — host should start listening immediately. */
  onMicDown?: () => void;
  /** Called on Hold-mode release — host should submit whatever was heard. */
  onForceStop?: () => void;
  /** Called when a Hold gesture is cancelled, so partial audio is never submitted by accident. */
  onMicCancel?: () => void;
  /** Optional input-mode controls (e.g. the Mark/draw-to-ask toggle) rendered inline with the
   *  attach/send cluster, so they sit with the other input affordances instead of in a separate bar. */
  tools?: ReactNode;
  /** Small overlay anchored to the mic button's own corner (e.g. a mic-mode chevron + popover).
   *  Omitted entirely leaves the mic button exactly as before — Demo doesn't pass this. */
  micExtra?: ReactNode;
}

export function CommandComposer({
  value,
  onChange,
  onSend,
  listening,
  onMic,
  micMode = 'tap',
  micArmed = false,
  micPaused = false,
  micProcessing = false,
  micDisabled = false,
  placeholder,
  disabled,
  heard,
  focusSignal,
  onFiles,
  attachTitle,
  attachPulse,
  onMicDown,
  onForceStop,
  onMicCancel,
  tools,
  micExtra,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Brief attention pulse on the attach button (driven by attachPulse). Cleared on a timer so the
  // animation can re-fire on the next bump; the timeout is torn down on unmount.
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (!attachPulse) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1100);
    return () => clearTimeout(t);
  }, [attachPulse]);

  const holdActiveRef = useRef(false);
  const holdPointerRef = useRef<number | null>(null);
  const skipNextClickRef = useRef(false);
  const onMicCancelRef = useRef(onMicCancel);
  onMicCancelRef.current = onMicCancel;

  useEffect(
    () => () => {
      if (holdActiveRef.current) onMicCancelRef.current?.();
    },
    [],
  );

  useEffect(() => {
    if (micMode === 'hold') return;
    skipNextClickRef.current = false;
    if (holdActiveRef.current) {
      holdActiveRef.current = false;
      holdPointerRef.current = null;
      onMicCancelRef.current?.();
    }
  }, [micMode]);

  useEffect(() => {
    if (!listening && inputRef.current) inputRef.current.focus();
  }, [listening]);
  // Re-focus on every signal bump, even when the input is already mounted.
  useEffect(() => {
    if (focusSignal && inputRef.current) inputRef.current.focus();
  }, [focusSignal]);

  const handleMicPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (micMode !== 'hold' || micDisabled || micProcessing || listening || holdActiveRef.current)
        return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      holdActiveRef.current = true;
      holdPointerRef.current = e.pointerId;
      skipNextClickRef.current = true;
      onMicDown?.();
    },
    [micDisabled, micProcessing, listening, micMode, onMicDown],
  );

  const finishHold = useCallback(() => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    holdPointerRef.current = null;
    onForceStop?.();
  }, [onForceStop]);

  const handleMicPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (holdPointerRef.current !== e.pointerId) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      finishHold();
    },
    [finishHold],
  );

  const cancelHold = useCallback(
    (e?: React.PointerEvent<HTMLButtonElement>) => {
      if (!holdActiveRef.current) return;
      if (
        e &&
        holdPointerRef.current === e.pointerId &&
        e.currentTarget.hasPointerCapture(e.pointerId)
      ) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      holdActiveRef.current = false;
      holdPointerRef.current = null;
      onMicCancel?.();
    },
    [onMicCancel],
  );

  const handleMicKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (
        micMode !== 'hold' ||
        micDisabled ||
        micProcessing ||
        listening ||
        holdActiveRef.current ||
        e.repeat ||
        (e.key !== ' ' && e.key !== 'Enter')
      )
        return;
      e.preventDefault();
      holdActiveRef.current = true;
      skipNextClickRef.current = true;
      onMicDown?.();
    },
    [listening, micDisabled, micMode, micProcessing, onMicDown],
  );

  const handleMicKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (micMode !== 'hold' || (e.key !== ' ' && e.key !== 'Enter')) return;
      e.preventDefault();
      finishHold();
    },
    [finishHold, micMode],
  );

  const handleMicClick = useCallback(() => {
    if (micMode === 'hold' || skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return;
    }
    if (micDisabled || (micProcessing && micMode !== 'always')) return;
    onMic();
  }, [onMic, micDisabled, micMode, micProcessing]);

  const micLabel = micDisabled
    ? 'Microphone off'
    : micProcessing && micMode !== 'always'
      ? 'Finishing voice input'
      : listening
        ? 'Finish and send'
        : micPaused
          ? 'Resume always-on'
          : micArmed
            ? 'Pause always-on'
            : micMode === 'hold'
              ? 'Hold to talk'
              : 'Talk to Mavéa';

  const micButton = (
    <button
      className={
        'mic-btn' +
        (listening ? ' listening' : '') +
        (micArmed ? ' armed' : '') +
        (micPaused ? ' paused' : '') +
        (micProcessing ? ' processing' : '') +
        (micDisabled ? ' mic-off' : '')
      }
      onClick={handleMicClick}
      onPointerDown={handleMicPointerDown}
      onPointerUp={handleMicPointerUp}
      onPointerCancel={cancelHold}
      onKeyDown={handleMicKeyDown}
      onKeyUp={handleMicKeyUp}
      // title mirrors aria-label so the icon-only button also shows a native hover tooltip
      // (aria-label alone is screen-reader-only — nothing appears when a sighted user hovers).
      title={micLabel}
      aria-label={micLabel}
      // Not `disabled`: in always-on mode a tap during transcription is honoured (it pauses the
      // mic), and disabling would drop the button out of focus order mid-interaction.
      aria-busy={micProcessing}
    >
      {micDisabled ? <Icon.micOff /> : <Icon.mic />}
    </button>
  );

  return (
    <div className="composer">
      {micExtra ? (
        <div className="mic-btn-wrap">
          {micButton}
          {micExtra}
        </div>
      ) : (
        micButton
      )}

      {/* Typing wins: once you've typed anything, keep the input mounted so the mic engaging
          (always-on, or a still-open tap) can never swap it out and wipe your half-typed text.
          The listening/heard indicator only takes the slot when the field is empty. */}
      {heard && !value ? (
        <div className="live-listen heard">
          <span style={{ color: 'var(--text-primary)' }}>"{heard}"</span>
        </div>
      ) : listening && !value ? (
        <div className="live-listen">
          <span className="wave">
            {[14, 18, 10, 20, 8, 16, 12].map((h, i) => (
              <i key={i} style={{ height: h }}></i>
            ))}
          </span>
          Listening…
        </div>
      ) : (
        <input
          ref={inputRef}
          className="composer-input"
          name="mavea-ask"
          aria-label={placeholder || 'Ask Mavéa anything'}
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder || 'Ask Mavéa anything — or just talk'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // `isComposing` guards IME input: while a Japanese, Chinese or Korean candidate window
            // is open, Enter COMMITS the candidate. Without this check that same Enter also sent
            // the turn, so the question left half-typed and the reader had to write it again.
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && value.trim()) onSend(value);
          }}
        />
      )}

      {onFiles && (
        <>
          <input
            ref={fileRef}
            type="file"
            name="mavea-attach"
            accept={ACCEPTED_TYPES}
            multiple
            disabled={disabled}
            hidden
            aria-hidden="true"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onFiles(files);
              // Reset so re-picking the same file fires onChange again.
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className={'composer-tool' + (pulsing ? ' is-pulsing' : '')}
            title={attachTitle || 'Attach a file'}
            aria-label={attachTitle || 'Attach a file'}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            <Icon.paperclip />
          </button>
        </>
      )}
      {tools}
      <button
        className="send-btn"
        disabled={disabled || !value.trim()}
        onClick={() => onSend(value)}
        title="Send"
        aria-label="Send"
      >
        <Icon.send />
      </button>
    </div>
  );
}
