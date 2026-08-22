// FallbackCard.tsx — the graceful-degradation card. When a block's designed component can't
// render — its family chunk failed to load, its type has no renderer, or it threw on an
// unexpected prop shape — the words the model wrote still reach the screen as a clean,
// readable card. Without this, a failed block rendered as NOTHING: the answer's content
// silently vanished, and a concept-section header could sit orphaned above an empty grid.
// Deliberately quiet — it reads as a simple list card, never as an error state — and built
// from pure text + design tokens, so it is theme-correct and can never itself throw.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { Block } from '../data/conversation';
import { blockLabel } from './blockLabel';
import { projectText } from './lib/projectText';
import './lib/fallback.css';

export function FallbackCard({ block }: { block: Block }) {
  const { lines, more } = projectText(block.props);
  return (
    <div
      className="card reveal fb-card"
      style={{ ['--delay' as string]: (block.delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Icon.layers className="ic" /> {blockLabel(block)}
      </div>
      <ul className="fb-lines">
        {lines.length > 0 ? (
          <>
            {lines.map((line, i) => (
              <li key={i} className="fb-line">
                {line}
              </li>
            ))}
            {more > 0 && <li className="fb-line fb-more">+{more} more</li>}
          </>
        ) : (
          <li className="fb-line">No readable details were returned for this visual.</li>
        )}
      </ul>
    </div>
  );
}
