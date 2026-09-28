import { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from '../../icons/icons';
import './copy.css';

interface Props {
  text: string;
  className?: string;
  /** Accessible label; defaults to "Copy" */
  label?: string;
}

/**
 * A clipboard copy button that briefly shows a check-mark confirmation.
 * Shared across any block that needs a copy affordance (code, drafts, etc.).
 */
export function CopyButton({ text, className = '', label = 'Copy' }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = useCallback(() => {
    // A refused write (no permission, insecure context) leaves the button as it was.
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }, [text]);

  const Ic = copied ? Icon.check : Icon.copy;

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copied' : ''}${className ? ' ' + className : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      <Ic className="ic" aria-hidden="true" />
    </button>
  );
}
