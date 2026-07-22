// Inline output panel rendered directly beneath a RunButton.
// Intentionally NOT a full card — it reads as a continuation of the codeblock,
// not a separate answer block. The left-border treatment is the same pattern
// used by annotation/aside elements elsewhere: colour-coded by success vs error,
// subtle tinted background, dismissible.
//
// Animation: the panel fades in at mount (CSS transition on opacity). We use a
// one-tick state flip so the initial render lands at opacity:0 before the
// transition target takes hold — a pure-CSS approach that requires no keyframe
// declarations and respects prefers-reduced-motion via the token system.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SandboxResult } from './sandbox';

interface Props {
  result: SandboxResult;
  onDismiss: () => void;
}

const FADE_DURATION_MS = 200;

export function CodeOutput({ result, onDismiss }: Props) {
  // Start invisible; flip to visible on the next tick so the CSS transition fires.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // One-tick defer puts the opacity:1 assignment into a separate paint frame,
    // giving the browser time to commit the opacity:0 initial render.
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const accent = result.ok ? 'var(--presence)' : 'var(--warning)';

  const container: CSSProperties = {
    borderLeft: `2px solid ${accent}`,
    background: `color-mix(in oklab, ${accent} 8%, transparent)`,
    padding: '8px 12px',
    borderRadius: '0 6px 6px 0',
    position: 'relative',
    marginTop: 8,
    opacity: visible ? 1 : 0,
    transition: `opacity ${FADE_DURATION_MS}ms ease`,
  };

  const header: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: result.ok && result.output ? 6 : 0,
  };

  const label: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: accent,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    lineHeight: 1,
  };

  const elapsed: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginLeft: 8,
    fontVariantNumeric: 'tabular-nums',
  };

  const dismiss: CSSProperties = {
    appearance: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 14,
    lineHeight: 1,
    padding: '0 0 0 8px',
    display: 'flex',
    alignItems: 'center',
  };

  const output: CSSProperties = {
    margin: 0,
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--text-primary)',
    maxHeight: 200,
    overflowY: 'auto',
  };

  // Surface the text to render (output on success, error message on failure).
  const text = result.ok ? result.output : result.error;
  const labelText = result.ok ? 'Output' : 'Error';

  return (
    <div style={container} role={result.ok ? 'region' : 'alert'} aria-label={`Code ${labelText}`}>
      <div style={header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={label}>{labelText}</span>
          <span style={elapsed}>{result.elapsed}ms</span>
        </div>
        <button
          type="button"
          style={dismiss}
          onClick={onDismiss}
          aria-label="Dismiss output"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {text ? (
        <pre style={output}>{text}</pre>
      ) : result.ok ? (
        // An empty output is a valid run (void-return code) — tell the user rather than
        // leaving a blank pane that reads as a rendering bug.
        <span style={{ ...output, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          (no output)
        </span>
      ) : null}
    </div>
  );
}
