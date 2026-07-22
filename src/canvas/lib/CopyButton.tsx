import { useState, useCallback } from 'react';
import { Icon } from '../../icons/icons';

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

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
