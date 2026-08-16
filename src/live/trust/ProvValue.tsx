// ProvValue.tsx — a figure in prose that can prove itself. At rest it is PLAIN TEXT: the
// surrounding font, the surrounding colour, no badge — a canvas where every number is decorated
// teaches the reader to ignore the decoration. The affordance shows on hover and on keyboard
// focus; the accessible name carries it always. A value with nothing to prove — an unknown id, or
// a structure value that never had a number — is never a button.
import { type ReactElement } from 'react';
import { statusOf } from './types';
import { rawOf } from './display';
import { useTrust } from './trustContext';

interface ProvValueProps {
  /** The WorldValue id. Unknown here means the world doesn't carry this figure. */
  id: string;
  className?: string;
}

export function ProvValue({ id, className }: ProvValueProps): ReactElement | null {
  const trust = useTrust();
  const value = trust?.registry.values.get(id);
  // Nothing to render and nothing to prove — better silent than a stray id or an "undefined".
  if (!value) return null;

  const cls = 'tr-num' + (className ? ` ${className}` : '');
  if (value.kind === 'structure') {
    return (
      <span className={`${cls} tr-num-qual`} data-status="structure">
        {value.resolution.raw}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      data-status={statusOf(value)}
      onClick={(e) => trust?.open(id, e.currentTarget)}
    >
      {rawOf(value)}
      <span className="tr-sr">, source available</span>
    </button>
  );
}
