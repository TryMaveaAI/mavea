import { useId, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { CardGroup, PlayingCard, PlayingCardsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PlayingCardsProps & { delay?: number };

// Card face coordinate space — poker ratio (2.5 × 3.5), centered pip space at (125, 175).
const CW = 250;
const CH = 350;
const CX = CW / 2;
const CY = CH / 2;

// Suit pips drawn in a centered ±50 box, scaled per use. Hearts/diamonds are single paths;
// spade carries its stem in the path; club is circles + stem, so it renders as a group.
const PIP_PATHS: Record<string, string> = {
  diamonds: 'M0 -46 L32 0 L0 46 L-32 0 Z',
  hearts:
    'M0 42 C-28 18 -42 2 -42 -14 C-42 -30 -30 -40 -18 -40 C-10 -40 -3 -35 0 -27 C3 -35 10 -40 18 -40 C30 -40 42 -30 42 -14 C42 2 28 18 0 42 Z',
  spades:
    'M0 -44 C-24 -16 -40 -4 -40 12 C-40 26 -29 34 -19 34 C-12 34 -6 31 -2 25 C-4 36 -8 42 -14 47 L14 47 C8 42 4 36 2 25 C6 31 12 34 19 34 C29 34 40 26 40 12 C40 -4 24 -16 0 -44 Z',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);
const SUIT_NAMES = new Set(['spades', 'hearts', 'diamonds', 'clubs']);

function Pip({
  x,
  y,
  s,
  suit,
  flip,
}: {
  x: number;
  y: number;
  s: number;
  suit: string;
  flip?: boolean;
}) {
  const scale = s / 100;
  const transform = `translate(${x},${y}) scale(${scale})${flip ? ' rotate(180)' : ''}`;
  if (suit === 'clubs') {
    return (
      <g transform={transform}>
        <circle cx={0} cy={-22} r={18} />
        <circle cx={-17} cy={4} r={18} />
        <circle cx={17} cy={4} r={18} />
        <path d="M-2 6 C-3 22 -7 34 -13 44 L13 44 C7 34 3 22 2 6 Z" />
      </g>
    );
  }
  return (
    <g transform={transform}>
      <path d={PIP_PATHS[suit] ?? PIP_PATHS.spades} />
    </g>
  );
}

// True pip arrangements for the number cards, in centered coordinates. Pips in the lower half
// are drawn rotated 180° — the same convention as a physical deck.
const COLS = 55;
const PIP_LAYOUT: Record<string, [number, number][]> = {
  '2': [
    [0, -100],
    [0, 100],
  ],
  '3': [
    [0, -100],
    [0, 0],
    [0, 100],
  ],
  '4': [
    [-COLS, -100],
    [COLS, -100],
    [-COLS, 100],
    [COLS, 100],
  ],
  '5': [
    [-COLS, -100],
    [COLS, -100],
    [0, 0],
    [-COLS, 100],
    [COLS, 100],
  ],
  '6': [
    [-COLS, -100],
    [COLS, -100],
    [-COLS, 0],
    [COLS, 0],
    [-COLS, 100],
    [COLS, 100],
  ],
  '7': [
    [-COLS, -100],
    [COLS, -100],
    [0, -50],
    [-COLS, 0],
    [COLS, 0],
    [-COLS, 100],
    [COLS, 100],
  ],
  '8': [
    [-COLS, -100],
    [COLS, -100],
    [0, -50],
    [-COLS, 0],
    [COLS, 0],
    [0, 50],
    [-COLS, 100],
    [COLS, 100],
  ],
  '9': [
    [-COLS, -100],
    [COLS, -100],
    [-COLS, -33],
    [COLS, -33],
    [0, 0],
    [-COLS, 33],
    [COLS, 33],
    [-COLS, 100],
    [COLS, 100],
  ],
  '10': [
    [-COLS, -100],
    [COLS, -100],
    [0, -66],
    [-COLS, -33],
    [COLS, -33],
    [-COLS, 33],
    [COLS, 33],
    [0, 66],
    [-COLS, 100],
    [COLS, 100],
  ],
};

/** One SVG playing card. Every card in an answer shares the pattern def keyed on `backId`. */
function Card({ card, backId }: { card: PlayingCard; backId: string }) {
  const suit = card.suit && SUIT_NAMES.has(card.suit) ? card.suit : 'spades';
  // A missing rank shows as '?' (a court-style face) rather than inventing a value.
  const rank =
    String(card.rank ?? '')
      .trim()
      .slice(0, 3) || '?';
  const red = RED_SUITS.has(suit);

  if (card.faceDown) {
    return (
      <svg viewBox={`0 0 ${CW} ${CH}`} className="pcd-svg" role="img" aria-label="Face-down card">
        <rect x={3} y={3} width={CW - 6} height={CH - 6} rx={18} className="pcd-face" />
        <rect
          x={16}
          y={16}
          width={CW - 32}
          height={CH - 32}
          rx={10}
          className="pcd-back"
          fill={`url(#${backId})`}
        />
      </svg>
    );
  }

  const pips = PIP_LAYOUT[rank];
  const court = !pips; // A, J, Q, K — and any unrecognized rank degrades to the same letter face
  const cornerSize = rank.length > 2 ? 30 : rank.length === 2 ? 38 : 46;

  const corner = (
    <g className={red ? 'pcd-red' : 'pcd-blk'}>
      <text x={30} y={30} className="pcd-rank" style={{ fontSize: cornerSize }}>
        {rank}
      </text>
      <Pip x={30} y={78} s={34} suit={suit} />
    </g>
  );

  let center: ReactNode;
  if (rank === 'A') {
    center = (
      <g className={red ? 'pcd-red' : 'pcd-blk'}>
        <Pip x={CX} y={CY} s={120} suit={suit} />
      </g>
    );
  } else if (court) {
    center = (
      <g className={red ? 'pcd-red' : 'pcd-blk'}>
        <rect x={54} y={70} width={CW - 108} height={CH - 140} rx={8} className="pcd-frame" />
        <text
          x={CX}
          y={CY - 26}
          className="pcd-court"
          style={{ fontSize: rank.length > 1 ? 58 : 86 }}
        >
          {rank}
        </text>
        <Pip x={CX} y={CY + 52} s={54} suit={suit} />
      </g>
    );
  } else {
    center = (
      <g className={red ? 'pcd-red' : 'pcd-blk'}>
        {pips.map(([px, py], i) => (
          <Pip key={i} x={CX + px} y={CY + py * 0.92} s={48} suit={suit} flip={py > 0} />
        ))}
      </g>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      className="pcd-svg"
      role="img"
      aria-label={`${rank} of ${suit}`}
    >
      <rect x={3} y={3} width={CW - 6} height={CH - 6} rx={18} className="pcd-face" />
      {corner}
      <g transform={`rotate(180 ${CX} ${CY})`} className={red ? 'pcd-red' : 'pcd-blk'}>
        <text x={30} y={30} className="pcd-rank" style={{ fontSize: cornerSize }}>
          {rank}
        </text>
        <Pip x={30} y={78} s={34} suit={suit} />
      </g>
      {center}
    </svg>
  );
}

// Fan geometry: per-card shift (% of the card's own width), rotation, and a card width chosen
// so the whole spread stays inside the group box — container-relative, no fixed pixel widths.
function fanPlan(n: number): { widthPct: number; stepPct: number; stepDeg: number } {
  const stepPct = Math.min(58, 320 / Math.max(1, n - 1));
  const spreadFactor = 1 + ((n - 1) * stepPct) / 100;
  const widthPct = Math.min(24, 94 / spreadFactor);
  const stepDeg = Math.min(8, 44 / Math.max(1, n - 1));
  return { widthPct, stepPct, stepDeg };
}

const MAX_CARDS = 26;

function Group({ group, backId }: { group: CardGroup; backId: string }) {
  const all = Array.isArray(group.cards)
    ? group.cards.filter((c) => c && typeof c === 'object')
    : [];
  const cards = all.slice(0, MAX_CARDS);
  const extra = all.length - cards.length;
  const layout = group.layout === 'fan' || group.layout === 'stack' ? group.layout : 'row';
  const n = cards.length;

  let body: ReactNode;
  if (n === 0) {
    body = <div className="pcd-none">No cards</div>;
  } else if (layout === 'fan') {
    const { widthPct, stepPct, stepDeg } = fanPlan(n);
    const c = (n - 1) / 2;
    body = (
      <div className="pcd-fan">
        {cards.map((card, i) => (
          <div
            key={i}
            className="pcd-fancard"
            style={{
              width: `${widthPct}%`,
              transform: `translateX(${(i - c) * stepPct}%) rotate(${(i - c) * stepDeg}deg) translateY(${Math.abs(i - c) * Math.abs(i - c) * stepDeg * 0.16}px)`,
            }}
          >
            <Card card={card} backId={backId} />
          </div>
        ))}
      </div>
    );
  } else if (layout === 'stack') {
    const shown = Math.min(n, 7); // deeper stacks read as one pile; the ×N badge keeps the count honest
    body = (
      <div className="pcd-stackrow">
        <div className="pcd-stack">
          {cards.slice(0, shown).map((card, i) => (
            <div
              key={i}
              className="pcd-stackcard"
              style={{ transform: `translate(${i * 4}%, ${i * 3}%)` }}
            >
              <Card card={card} backId={backId} />
            </div>
          ))}
        </div>
        {n > 1 && <span className="pcd-count tab-num">×{n}</span>}
      </div>
    );
  } else {
    body = (
      <div className="pcd-row">
        {cards.map((card, i) => (
          <div
            key={i}
            className="pcd-rowcard"
            style={{ ['--pcd-n' as string]: n } as CSSProperties}
          >
            <Card card={card} backId={backId} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pcd-group">
      {group.label && <div className="pcd-glabel">{group.label}</div>}
      {body}
      {extra > 0 && <div className="pcd-more">+{extra} more</div>}
    </div>
  );
}

export function PlayingCards({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  groups,
  note,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const uid = useId().replace(/:/g, '');
  const backId = `pcd-back-${uid}`;

  const list = Array.isArray(groups) ? groups.filter((g) => g && typeof g === 'object') : [];
  const hasCards = list.some((g) => Array.isArray(g.cards) && g.cards.length > 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {!hasCards ? (
        <BlockEmpty message="No cards to show" />
      ) : (
        <div className="pcd-wrap">
          {/* the face-down lattice, defined once and shared by every card in the answer */}
          <svg width="0" height="0" className="pcd-defs" aria-hidden focusable="false">
            <defs>
              <pattern id={backId} patternUnits="userSpaceOnUse" width="26" height="26">
                <rect width="26" height="26" className="pcd-backfill" />
                <path d="M0 26 L26 0 M-6 6 L6 -6 M20 32 L32 20" className="pcd-backline" />
                <path d="M0 0 L26 26 M20 -6 L32 6 M-6 20 L6 32" className="pcd-backline" />
              </pattern>
            </defs>
          </svg>
          {list.map((g, i) => (
            <Group key={i} group={g} backId={backId} />
          ))}
        </div>
      )}

      {note && <div className="pcd-note">{note}</div>}

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
