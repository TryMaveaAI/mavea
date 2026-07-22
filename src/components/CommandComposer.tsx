// The input bar: mic button, a live "listening"/"heard" indicator, the text field,
// and send. Voice and typing both funnel through onSend, so the host treats them alike.
import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { Icon } from '../icons/icons';
import { ACCEPTED_TYPES } from '../live/attachments';

// How long the user must hold the mic button before it switches from tap-to-toggle
// to push-to-talk (PTT) mode. Under this threshold it's treated as a normal click.
const PTT_THRESHOLD_MS = 350;

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: (v: string) => void;
  listening: boolean;
  onMic: () => void;
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
  /** Called when a PTT hold starts (>350ms) — host should start listening. */
  onMicDown?: () => void;
  /** Called on PTT release — host should force-submit whatever was heard. */
  onForceStop?: () => void;
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

  // PTT state — refs so they never cause re-renders.
  const pttTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pttActiveRef = useRef(false); // currently in PTT hold mode
  const skipNextClickRef = useRef(false); // PTT release happened — skip the upcoming click

  useEffect(() => {
    if (!listening && inputRef.current) inputRef.current.focus();
  }, [listening]);
  // Re-focus on every signal bump, even when the input is already mounted.
  useEffect(() => {
    if (focusSignal && inputRef.current) inputRef.current.focus();
  }, [focusSignal]);

  const handleMicPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (micDisabled || listening) return; // already listening — let click handle the stop
      e.currentTarget.setPointerCapture(e.pointerId); // keep events even if finger drifts
      pttActiveRef.current = false;
      pttTimerRef.current = setTimeout(() => {
        pttActiveRef.current = true;
        onMicDown?.();
      }, PTT_THRESHOLD_MS);
    },
    [micDisabled, listening, onMicDown],
  );

  const handleMicPointerUp = useCallback(() => {
    if (pttTimerRef.current !== null) {
      clearTimeout(pttTimerRef.current);
      pttTimerRef.current = null;
    }
    if (pttActiveRef.current) {
      pttActiveRef.current = false;
      skipNextClickRef.current = true; // tell onClick to skip — PTT already handled it
      onForceStop?.();
    }
  }, [onForceStop]);

  const handleMicClick = useCallback(() => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return; // came from a PTT release — already handled in onPointerUp
    }
    if (micDisabled) return; // a disabled mic is honestly dead, not secretly listening
    onMic();
  }, [onMic, micDisabled]);

  const micButton = (
    <button
      className={'mic-btn' + (listening ? ' listening' : '') + (micDisabled ? ' mic-off' : '')}
      onClick={handleMicClick}
      onPointerDown={handleMicPointerDown}
      onPointerUp={handleMicPointerUp}
      onPointerCancel={handleMicPointerUp}
      // title mirrors aria-label so the icon-only button also shows a native hover tooltip
      // (aria-label alone is screen-reader-only — nothing appears when a sighted user hovers).
      title={micDisabled ? 'Microphone off' : listening ? 'Stop listening' : 'Talk to Mavéa'}
      aria-label={micDisabled ? 'Microphone off' : listening ? 'Stop listening' : 'Talk to Mavéa'}
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
