// Tabletop scorepad — a players × rounds grid that reads like the paper pad you'd fill in by
// hand, with the running total highlighted per player and the current leader called out. A CSS
// grid (not a <table>) so the round-label column and every player column stay one shared,
// horizontally-scrollable track regardless of how many players or rounds there are.
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { BoardgamescoreProps, BoardGamePlayer } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BoardgamescoreProps & { delay?: number };

interface PlayerModel {
  key: string;
  name: string;
  /** one entry per round, null where that player has no recorded score for it yet */
  scores: (number | null)[];
  total: number;
}

/** Sum only the finite scores a player actually has, so a still-in-progress round (a hole in
 *  `scores`) never turns a real partial total into NaN. */
function sumScores(scores: (number | null)[]): number {
  let s = 0;
  for (const v of scores) if (v !== null) s += v;
  return s;
}

export function BoardGameScore({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  game,
  players,
  rounds,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const list = Array.isArray(players) ? players : [];

  // Round count: an explicit `rounds` wins; otherwise the longest roundScores among players,
  // so a player who's a round behind doesn't shrink the grid everyone else needs.
  const roundCount =
    Number.isFinite(rounds) && (rounds as number) > 0
      ? Math.round(rounds as number)
      : Math.max(0, ...list.map((p) => (Array.isArray(p?.roundScores) ? p.roundScores.length : 0)));

  const built: PlayerModel[] = list.map((p: BoardGamePlayer, i) => {
    const name = typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : `Player ${i + 1}`;
    const raw = Array.isArray(p?.roundScores) ? p.roundScores : [];
    const scores = Array.from({ length: roundCount }, (_, r) =>
      Number.isFinite(raw[r]) ? (raw[r] as number) : null,
    );
    const total = Number.isFinite(p?.total) ? (p.total as number) : sumScores(scores);
    return { key: `${name}-${i}`, name, scores, total };
  });

  const hasPlayers = built.length > 0;
  const maxTotal = hasPlayers ? Math.max(...built.map((p) => p.total)) : 0;
  // A tie at the top makes everyone tied the leader — never pick an arbitrary "first" winner.
  const leaders = new Set(
    hasPlayers ? built.filter((p) => p.total === maxTotal).map((p) => p.key) : [],
  );
  const soleLeader = leaders.size === 1 ? built.find((p) => leaders.has(p.key))! : null;
  const margin =
    soleLeader && built.length > 1
      ? soleLeader.total -
        Math.max(...built.filter((p) => p.key !== soleLeader.key).map((p) => p.total))
      : null;

  // Grid children in strict reading order — the label cell then every player's cell — for
  // each round, so CSS grid's implicit auto-flow (row by row) lines each score up under its
  // own player column. Building the header, rounds, and total as one flat array (rather than
  // three separate <div> groups) is what keeps that row-major order intact.
  const cells: ReactNode[] = [];
  cells.push(<div key="corner" className="bgs-cell bgs-head bgs-corner" aria-hidden="true" />);
  for (const p of built) {
    cells.push(
      <div key={`h-${p.key}`} className="bgs-cell bgs-head bgs-player">
        {leaders.has(p.key) && (
          <span className="bgs-crown" aria-label="leading" title="Leading">
            ●
          </span>
        )}
        <span className="bgs-name">{p.name}</span>
      </div>,
    );
  }
  for (let r = 0; r < roundCount; r++) {
    cells.push(
      <div
        key={`rl-${r}`}
        className="bgs-cell bgs-rowlabel m-fade-rise m-stagger-item"
        style={{ ['--i' as string]: r } as CSSProperties}
      >
        R{r + 1}
      </div>,
    );
    for (const p of built) {
      cells.push(
        <div
          key={`s-${p.key}-${r}`}
          className="bgs-cell bgs-score tab-num m-fade-rise m-stagger-item"
          style={{ ['--i' as string]: r } as CSSProperties}
        >
          {p.scores[r] === null ? '–' : p.scores[r]!.toLocaleString()}
        </div>,
      );
    }
  }
  cells.push(
    <div key="tl" className="bgs-cell bgs-rowlabel bgs-totallabel">
      Total
    </div>,
  );
  for (const p of built) {
    cells.push(
      <div
        key={`t-${p.key}`}
        className={`bgs-cell bgs-total tab-num ${leaders.has(p.key) ? 'lead' : ''}`}
        data-mark={leaders.has(p.key) ? 'underline' : undefined}
      >
        {p.total.toLocaleString()}
      </div>,
    );
  }

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {game && <span className="bgs-game faint">{game}</span>}
      </div>

      {!hasPlayers && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Provide players with round scores.
        </p>
      )}

      {hasPlayers && (
        <div className="bgs-scroll">
          <div
            className="bgs-grid"
            style={
              {
                ['--bgs-cols' as string]: built.length,
                minWidth: `${64 + built.length * 84}px`,
              } as CSSProperties
            }
          >
            {cells}
          </div>
        </div>
      )}

      {soleLeader && margin !== null && (
        <p className="bgs-lead-note faint">
          {soleLeader.name} leads{margin > 0 ? ` by ${margin.toLocaleString()}` : ''}.
        </p>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
