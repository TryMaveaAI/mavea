import type { CSSProperties } from 'react';
import type { CompanionNoteProps } from './types';

type Props = CompanionNoteProps & { delay?: number };

// Deliberately low-chrome: one warm reflection that mirrors the feeling in the user's words — no
// eyebrow, icon, badge, bar, bullet, or number. For emotional moments where being heard matters more
// than information. reframecard offers a cognitive MOVE; this offers presence, no move. On an acute
// crisis turn the selector suppresses this in favour of a lifeline surface.
export function CompanionNote({ reflection, follow, chip, delay }: Props) {
  return (
    <div
      className="card reveal cn-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <p className="cn-reflection">{reflection}</p>
      {follow && <p className="cn-follow">{follow}</p>}
      {chip && <span className="cn-chip">{chip}</span>}
    </div>
  );
}
