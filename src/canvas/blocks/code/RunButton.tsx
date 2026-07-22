// "▶ Run" pill button rendered below a codeblock for runnable languages.
// The button owns only the execution lifecycle: idle → running → [done | error].
// The caller receives the result via `onResult` and decides how to display it.
// Error state auto-resets after 2 s so a failed first attempt doesn't leave the
// button permanently broken.
import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { runInSandbox, type SandboxLang, type SandboxResult } from './sandbox';
import { useTimeout } from '../../../hooks/useTimeout';

type RunState = 'idle' | 'running' | 'error';

interface Props {
  code: string;
  lang: string;
  onResult: (result: SandboxResult) => void;
}

// Shared layout for all states — only colour and content change.
const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 12px',
  borderRadius: 999,
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 500,
  lineHeight: 1.4,
  cursor: 'pointer',
  transition: 'border-color 0.25s, color 0.25s, opacity 0.2s',
  userSelect: 'none',
};

const styles: Record<RunState | 'success-flash', CSSProperties> = {
  idle: {
    ...base,
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--text-secondary)',
    opacity: 1,
  },
  running: {
    ...base,
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--text-secondary)',
    opacity: 0.6,
    cursor: 'default',
  },
  error: {
    ...base,
    background: 'transparent',
    border: '1px solid var(--warning)',
    color: 'var(--warning)',
    opacity: 1,
  },
  'success-flash': {
    ...base,
    background: 'transparent',
    border: '1px solid var(--presence)',
    color: 'var(--presence)',
    opacity: 1,
  },
};

export function RunButton({ code, lang, onResult }: Props) {
  const [state, setState] = useState<RunState>('idle');
  // True for the brief 500 ms success flash after a good run.
  const [flash, setFlash] = useState(false);

  // Auto-reset the error state after 2 s so the user can try again.
  useTimeout(() => setState('idle'), state === 'error' ? 2000 : null);
  // Clear the success-flash after 500 ms.
  useTimeout(() => setFlash(false), flash ? 500 : null);

  const run = useCallback(async () => {
    if (state === 'running') return;
    setState('running');
    // The lang is narrowed to SandboxLang by the parent (only rendered when isRunnableLang),
    // so the cast is safe — we just avoid threading the type constraint through TopicCanvas.
    const result = await runInSandbox(code, lang as SandboxLang);
    if (result.ok) {
      setFlash(true);
      setState('idle');
    } else {
      setState('error');
    }
    onResult(result);
  }, [code, lang, onResult, state]);

  const effectiveStyle = flash ? styles['success-flash'] : styles[state];

  const label = state === 'running' ? '● Running…' : state === 'error' ? '✕ Error' : '▶ Run safely';

  return (
    <button
      type="button"
      style={effectiveStyle}
      onClick={run}
      disabled={state === 'running'}
      aria-label={state === 'running' ? 'Running code…' : 'Run code in isolated sandbox'}
      title="Runs only after your click in a network-blocked, time-limited sandbox"
    >
      {label}
    </button>
  );
}
