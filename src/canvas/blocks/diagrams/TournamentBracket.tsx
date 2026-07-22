// TournamentBracket — a single-elimination bracket: one column per round, joined by SVG elbow
// connectors (BinaryTree's column+SVG-connector technique — geometry computed, nothing authored).
// Every matchup's y-centre comes from its slot; from round 1 on, a match centres on the midpoint
// of the two matches (slot*2, slot*2+1) that feed it — the standard bracket-doubling relationship
// — so the whole tree self-centers with no hand-placed coordinates. Winners are bold and tinted
// with --presence; the loser's name is muted. `double` is a reserved prop for a future
// losers-bracket pass and is NOT rendered here — see the catalog blurb.
import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { usePathDraw } from '../../lib/motion';
import type { TournamentBracketProps, TournamentMatchup } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TournamentBracketProps & { delay?: number };

// ── layout ──────────────────────────────────────────────────────────────────
const BOX_W = 170;
const ROW_H = 24;
const BOX_H = ROW_H * 2;
const COL_GAP = 48; // horizontal space reserved for the elbow connector between two columns
const PAD = 18;
const MATCH_GAP = 18; // vertical breathing room between two round-0 matches
const LABEL_H = 22; // room for the round-name header above the first box in each column

// SVG text neither wraps nor clips itself — a competitor name longer than the box truncates with
// an ellipsis and carries a <title> for the full string on hover, same idiom as BinaryTree/DpTable.
const NAME_MAX_CHARS = 15;
const ROUND_MAX_CHARS = 16;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface PlacedMatch extends TournamentMatchup {
  x: number;
  y: number;
}

interface Connector {
  key: string;
  d: string;
}

interface BracketLayout {
  placed: PlacedMatch[];
  connectors: Connector[];
  columnX: number[];
  W: number;
  H: number;
}

/** Groups matchups by round, then assigns every match a y-centre: round 0 spaces its matches
 *  evenly by slot; every later round centres on the midpoint of the two matches (slot*2, slot*2+1)
 *  that feed it, falling back to a single feeder's y (a bye) or its own even slot spacing when
 *  neither feeder is present in the data — so odd/incomplete brackets still lay out sanely. */
function layoutBracket(roundLabels: string[], matchups: TournamentMatchup[]): BracketLayout {
  if (roundLabels.length === 0 || matchups.length === 0) {
    return { placed: [], connectors: [], columnX: [], W: 0, H: 0 };
  }

  // Defend against a round index past the declared round list — never drop data, widen instead.
  const roundCount = Math.max(roundLabels.length, Math.max(...matchups.map((m) => m.round)) + 1);

  const byRound = new Map<number, TournamentMatchup[]>();
  for (const m of matchups) {
    const r = Math.max(0, Math.round(m.round));
    const arr = byRound.get(r);
    if (arr) arr.push(m);
    else byRound.set(r, [m]);
  }
  for (const arr of byRound.values()) arr.sort((a, b) => a.slot - b.slot);

  const unit = BOX_H + MATCH_GAP;
  const baseY = (slot: number) => LABEL_H + PAD + slot * unit + BOX_H / 2;

  const yOf = new Map<string, number>();
  for (const m of byRound.get(0) ?? []) yOf.set(m.id, baseY(m.slot));

  for (let r = 1; r < roundCount; r++) {
    const prevBySlot = new Map((byRound.get(r - 1) ?? []).map((m) => [m.slot, m]));
    for (const m of byRound.get(r) ?? []) {
      const fa = prevBySlot.get(m.slot * 2);
      const fb = prevBySlot.get(m.slot * 2 + 1);
      const ya = fa ? yOf.get(fa.id) : undefined;
      const yb = fb ? yOf.get(fb.id) : undefined;
      const y = ya !== undefined && yb !== undefined ? (ya + yb) / 2 : (ya ?? yb ?? baseY(m.slot));
      yOf.set(m.id, y);
    }
  }

  const columnX = Array.from({ length: roundCount }, (_, r) => PAD + r * (BOX_W + COL_GAP));

  const placed: PlacedMatch[] = [];
  for (let r = 0; r < roundCount; r++) {
    for (const m of byRound.get(r) ?? []) placed.push({ ...m, x: columnX[r], y: yOf.get(m.id)! });
  }

  // Classic bracket "elbow": the two feeders each stub out horizontally to a shared midline, a
  // vertical segment joins them, and one more horizontal stub carries the midline into the match
  // it feeds. A single feeder (a bye, or a lopsided draw) still gets a full elbow to its target.
  const connectors: Connector[] = [];
  for (let r = 1; r < roundCount; r++) {
    const prevBySlot = new Map((byRound.get(r - 1) ?? []).map((m) => [m.slot, m]));
    const xFeed = columnX[r - 1] + BOX_W;
    const xMid = xFeed + COL_GAP / 2;
    const xTarget = columnX[r];
    for (const m of byRound.get(r) ?? []) {
      const fa = prevBySlot.get(m.slot * 2);
      const fb = prevBySlot.get(m.slot * 2 + 1);
      const yTarget = yOf.get(m.id)!;
      if (fa && fb) {
        const ya = yOf.get(fa.id)!;
        const yb = yOf.get(fb.id)!;
        connectors.push({
          key: `feed-${m.id}`,
          d: `M ${xFeed} ${ya} H ${xMid} V ${yb} H ${xFeed}`,
        });
        connectors.push({ key: `stub-${m.id}`, d: `M ${xMid} ${yTarget} H ${xTarget}` });
      } else if (fa || fb) {
        const yOnly = yOf.get((fa ?? fb)!.id)!;
        connectors.push({
          key: `feed-${m.id}`,
          d: `M ${xFeed} ${yOnly} H ${xMid} V ${yTarget} H ${xTarget}`,
        });
      }
    }
  }

  const maxY = Math.max(...placed.map((p) => p.y)) + BOX_H / 2 + PAD;
  const W = PAD + roundCount * BOX_W + (roundCount - 1) * COL_GAP + PAD;
  return { placed, connectors, columnX, W, H: maxY };
}

/** One elbow connector, drawing itself on with `usePathDraw` (a shared canvas motion primitive —
 *  see motion.ts) rather than simply appearing, so the bracket reads as being traced round by
 *  round instead of popping in whole. */
function Connector({ d, delay }: { d: string; delay: number }) {
  const ref = useRef<SVGPathElement>(null);
  usePathDraw(ref, { delay });
  return <path ref={ref} d={d} className="dg-tb-connector" />;
}

/** One half of a matchup box: a competitor's name + optional score, styled by whether they won,
 *  lost, or the slot is still open (a bye shows "BYE", an undecided empty slot shows "TBD"). */
function Slot({
  name,
  score,
  rowY,
  isWinner,
  isDecided,
}: {
  name?: string;
  score?: number;
  rowY: number;
  isWinner: boolean;
  isDecided: boolean;
}) {
  const label = name ?? (isDecided ? 'BYE' : 'TBD');
  const nameCls =
    'dg-tb-name' +
    (!name
      ? ' dg-tb-name-tbd'
      : isWinner
        ? ' dg-tb-name-winner'
        : isDecided
          ? ' dg-tb-name-loser'
          : '');
  const scoreCls =
    'dg-tb-score' + (isWinner ? ' dg-tb-score-winner' : isDecided ? ' dg-tb-score-loser' : '');
  return (
    <>
      <text x={12} y={rowY} dominantBaseline="central" className={nameCls}>
        {name && name.length > NAME_MAX_CHARS && <title>{name}</title>}
        {truncate(label, NAME_MAX_CHARS)}
      </text>
      {score !== undefined && (
        <text
          x={BOX_W - 12}
          y={rowY}
          dominantBaseline="central"
          textAnchor="end"
          className={scoreCls}
        >
          {score}
        </text>
      )}
    </>
  );
}

export function TournamentBracket({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  rounds,
  matchups,
  double = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;
  const layout = useMemo(() => layoutBracket(rounds, matchups), [rounds, matchups]);

  if (layout.placed.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
      >
        {title && (
          <div className="card-eyebrow">
            <Ic className="ic" style={{ color: iconColor }} /> {title}
          </div>
        )}
        <p className="dg-tb-empty">No matchups yet.</p>
      </div>
    );
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
          {double && <span className="dg-tb-note">single-elimination view</span>}
        </div>
      )}

      <div className="dg-tb-wrap">
        <svg
          viewBox={`0 0 ${layout.W} ${layout.H}`}
          width="100%"
          className="dg-tb-svg"
          role="img"
          aria-label={title ?? 'tournament bracket'}
        >
          {rounds.map((label, r) =>
            layout.columnX[r] !== undefined ? (
              <text
                key={`hdr-${r}`}
                x={layout.columnX[r] + BOX_W / 2}
                y={LABEL_H - 7}
                textAnchor="middle"
                className="dg-tb-round-label"
              >
                {label.length > ROUND_MAX_CHARS && <title>{label}</title>}
                {truncate(label, ROUND_MAX_CHARS)}
              </text>
            ) : null,
          )}

          {layout.connectors.map((c, i) => (
            <Connector key={c.key} d={c.d} delay={i * 45} />
          ))}

          {layout.placed.map((m, i) => {
            const decided = m.winner !== undefined;
            const boxTop = m.y - BOX_H / 2;
            return (
              // Position via the SVG `transform` attribute on the outer <g>, entrance motion via
              // CSS `transform` on the inner one — a CSS transform on an element wins over its own
              // transform ATTRIBUTE (replaces it, doesn't compose), so the two must live on
              // different nodes or the fade-rise would overwrite this box's placement.
              <g key={m.id} transform={`translate(${m.x} ${boxTop})`}>
                <g
                  className="dg-tb-box m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <rect width={BOX_W} height={BOX_H} rx={7} className="dg-tb-box-bg" />
                  {decided && m.winner === 'a' && (
                    <rect
                      x={1}
                      y={1}
                      width={BOX_W - 2}
                      height={ROW_H - 1}
                      rx={6}
                      className="dg-tb-row-winner"
                    />
                  )}
                  {decided && m.winner === 'b' && (
                    <rect
                      x={1}
                      y={ROW_H}
                      width={BOX_W - 2}
                      height={ROW_H - 1}
                      rx={6}
                      className="dg-tb-row-winner"
                    />
                  )}
                  <line x1={0} y1={ROW_H} x2={BOX_W} y2={ROW_H} className="dg-tb-divider" />
                  <Slot
                    name={m.a}
                    score={m.scoreA}
                    rowY={ROW_H / 2}
                    isWinner={decided && m.winner === 'a'}
                    isDecided={decided}
                  />
                  <Slot
                    name={m.b}
                    score={m.scoreB}
                    rowY={ROW_H + ROW_H / 2}
                    isWinner={decided && m.winner === 'b'}
                    isDecided={decided}
                  />
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
