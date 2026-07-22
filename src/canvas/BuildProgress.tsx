// A build checklist with done / active / todo steps.
// The build actually finishes: each `active` step spins briefly, then resolves to done
// (staggered) so it doesn't spin forever. `todo` steps that need permission stay a
// pending dot — that's a real "awaiting you" state, not an unfinished build.
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { BuildProgressProps, BuildStep } from '../data/conversation';

type Props = BuildProgressProps & { delay?: number };

export function BuildProgress({ title = 'Building it', steps, footer, delay }: Props) {
  // How many of the originally-active steps have finished so far.
  const [finished, setFinished] = useState(0);
  const activeCount = steps.filter((s) => s.status === 'active').length;

  useEffect(() => {
    if (activeCount === 0) return;
    const base = (delay || 0) + 1400;
    const timers = Array.from({ length: activeCount }, (_, k) =>
      setTimeout(() => setFinished((n) => Math.max(n, k + 1)), base + k * 900),
    );
    return () => timers.forEach(clearTimeout);
  }, [activeCount, delay]);

  // Resolve the Nth active step to "done" once its timer has fired.
  // The first step that is still active (in-progress) is the emphasis — Mavéa gestures at it.
  let activeSeen = 0;
  const resolved: BuildStep[] = steps.map((s) => {
    if (s.status !== 'active') return s;
    const done = activeSeen < finished;
    activeSeen += 1;
    return done ? { ...s, status: 'done' } : s;
  });

  const firstActiveIdx = resolved.findIndex((s) => s.status === 'active');
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.spark className="ic" style={{ color: 'var(--insight)' }} /> {title}
      </div>
      <div className="buildsteps">
        {resolved.map((s, i) => (
          <div className={'buildstep ' + (s.status || 'done')} key={i}>
            <span className="buildstep-ic" data-mark={i === firstActiveIdx ? 'circle' : undefined}>
              {s.status === 'active' ? (
                <span className="tiny-spin"></span>
              ) : s.status === 'todo' ? (
                <span className="bs-dot"></span>
              ) : (
                <Icon.check />
              )}
            </span>
            <span className="buildstep-body">
              <span className="buildstep-label">{s.label}</span>
              {s.sub && <span className="buildstep-sub">{s.sub}</span>}
            </span>
          </div>
        ))}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
