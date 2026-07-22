import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { ScoutingreportProps, ScoutingMatchupNote, ScoutingKeyPlayer } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScoutingreportProps & { delay?: number };

// A sports opponent scouting report — the opponent's tendencies as a prose list, per-matchup
// notes, and the key players to game-plan around. The pre-game counterpart to a live box score:
// what to expect before the ball is snapped/tipped, not what already happened.
export function Scoutingreport({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  opponent,
  tendencies,
  matchupNotes,
  keyPlayers,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const points = Array.isArray(tendencies)
    ? tendencies.filter((t) => typeof t === 'string' && t)
    : [];
  const notes = Array.isArray(matchupNotes) ? matchupNotes : [];
  const players = Array.isArray(keyPlayers) ? keyPlayers : [];

  if (!opponent && points.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No scouting notes yet" />
      </div>
    );
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {opponent && (
        <div className="scr-opponent">
          <span className="scr-opponent-label">Opponent</span>
          <span className="scr-opponent-name">{opponent}</span>
        </div>
      )}

      {points.length > 0 && (
        <div className="scr-section">
          <div className="scr-section-label">Tendencies</div>
          <ul className="scr-tendencies">
            {points.map((t, i) => (
              <li
                key={i}
                className="scr-tendency m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="scr-section">
          <div className="scr-section-label">Matchup notes</div>
          <div className="scr-notes">
            {notes.map((n, i) => (
              <MatchupNoteCard key={i} n={n} i={i} />
            ))}
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div className="scr-section">
          <div className="scr-section-label">Key players</div>
          <div className="scr-players">
            {players.map((p, i) => (
              <KeyPlayerChip key={i} p={p} i={i} />
            ))}
          </div>
        </div>
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

function MatchupNoteCard({ n, i }: { n: ScoutingMatchupNote; i: number }) {
  const label = typeof n?.label === 'string' && n.label.trim() ? n.label : 'Note';
  const note = typeof n?.note === 'string' ? n.note : '';
  if (!note) return null;
  return (
    <div
      className="scr-note m-stagger-item m-fade-rise"
      style={{ ['--i' as string]: i } as CSSProperties}
    >
      <span className="scr-note-label">{label}</span>
      <span className="scr-note-text">{note}</span>
    </div>
  );
}

function KeyPlayerChip({ p, i }: { p: ScoutingKeyPlayer; i: number }) {
  const name = typeof p?.name === 'string' && p.name.trim() ? p.name : 'Player';
  const role = typeof p?.role === 'string' && p.role.trim() ? p.role : '';
  const note = typeof p?.note === 'string' ? p.note : '';
  return (
    <div
      className="scr-player m-stagger-item m-fade-rise"
      style={{ ['--i' as string]: i } as CSSProperties}
    >
      <div className="scr-player-top">
        <span className="scr-player-name">{name}</span>
        {role && <span className="scr-player-role">{role}</span>}
      </div>
      {note && <span className="scr-player-note">{note}</span>}
    </div>
  );
}
