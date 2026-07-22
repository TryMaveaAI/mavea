// State 2 of a turn: working. Labeled skeleton cards announce what is being built —
// the kind and the user's own subject, shimmer lines for the not-yet-known content.
// A short mount delay keeps a cached or prefetched answer from flashing skeletons.
import { useEffect, useState, type ReactElement } from 'react';
import type { SkeletonCard } from './skeletonPlan';
// The shared skeleton vocabulary rides with this component, not the canvas chunk — the
// working column must keep its shimmer even when no TopicCanvas has mounted yet.
import '../../canvas/skeleton.css';
import './turnstate.css';

const MOUNT_DELAY_MS = 250;

export function WorkingSkeletons({ cards }: { cards: SkeletonCard[] }): ReactElement | null {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), MOUNT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (!show || cards.length === 0) return null;
  return (
    <div className="skel-grid" role="status" aria-label="Building the answer">
      {cards.map((c, i) => (
        <div key={i} className="skel-card">
          <span className="skel-eyebrow">✦ {c.label}…</span>
          {c.lines.map((w, j) => (
            <span key={j} className="skel-line" style={{ width: `${w}%` }}></span>
          ))}
        </div>
      ))}
    </div>
  );
}
