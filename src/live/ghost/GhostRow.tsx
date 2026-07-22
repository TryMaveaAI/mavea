// Ghost blocks — the answer forming behind your words. Dashed, breathing placeholders named
// by the model's glimpse of the half-spoken ask: FORMING for what's clearly coming, MAYBE
// for the direction the sentence might take. Pure presentation; they never carry data and
// never pretend to (a ghost has a title and a pulse, nothing else to mistake for an answer).
import type { ReactElement } from 'react';
import type { GhostCard } from './speculate';
import './ghost.css';

export function GhostRow({ ghosts }: { ghosts: GhostCard[] }): ReactElement | null {
  if (ghosts.length === 0) return null;
  return (
    <div className="ghost-row" aria-hidden="true">
      {ghosts.map((g, i) => (
        <div key={g.title} className={'ghost-card is-' + g.kind} style={{ ['--gi' as string]: i }}>
          <span className="ghost-kind">◌ {g.kind === 'forming' ? 'Forming' : 'Maybe'}</span>
          <span className="ghost-title">{g.title}</span>
          <span className="ghost-bones">
            <i />
            <i />
          </span>
        </div>
      ))}
    </div>
  );
}
