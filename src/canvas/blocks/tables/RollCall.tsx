import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { RollCallProps, Legislator, VoteValue } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RollCallProps & { delay?: number };

const VOTE_SET = new Set<VoteValue>(['yea', 'nay', 'present', 'absent']);
const VOTE_COLOR: Record<VoteValue, string> = {
  yea: 'var(--insight)',
  nay: 'var(--danger)',
  present: 'var(--warning)',
  absent: 'var(--text-muted)',
};
const VOTE_GLYPH: Record<VoteValue, string> = {
  yea: '✓',
  nay: '✕',
  present: '•',
  absent: '–',
};
const VOTE_LABEL: Record<VoteValue, string> = {
  yea: 'Yea',
  nay: 'Nay',
  present: 'Present',
  absent: 'Absent',
};
const VOTE_ORDER: VoteValue[] = ['yea', 'nay', 'present', 'absent'];

/** An unrecognized/missing vote reads as absent — the one value that can't overcount either
 *  side of the tally. */
function toVote(v: unknown): VoteValue {
  return typeof v === 'string' && VOTE_SET.has(v as VoteValue) ? (v as VoteValue) : 'absent';
}

// A small, visually distinct palette from the vote-status colors (insight/danger/warning/muted)
// so a party's row tint never gets mistaken for how that member actually voted.
const PARTY_PALETTE = [
  'var(--presence)',
  'var(--presence-deep)',
  'var(--insight-soft)',
  'var(--warning-soft)',
  'var(--presence-soft)',
];

/** Deterministic string→color so the same party name always bands the same way across rows,
 *  without hardcoding any real-world party's identity (a legislature is any legislature). */
function partyColor(party: string): string {
  if (!party) return 'var(--text-muted)';
  let h = 0;
  for (let i = 0; i < party.length; i++) h = (h * 31 + party.charCodeAt(i)) >>> 0;
  return PARTY_PALETTE[h % PARTY_PALETTE.length];
}

interface Row {
  leg: Legislator;
  name: string;
  party: string;
  vote: VoteValue;
}

// A legislative roll-call vote: a header tally bar (always counted from the roster, never a
// caller-supplied figure), party-line color banding per row, and a colored vote-glyph chip.
// Civics, legislative tracking — "how did the vote go".
export function RollCall({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bill,
  legislators,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const list = Array.isArray(legislators) ? legislators : [];
  const rows: Row[] = list
    .filter((l) => typeof l?.name === 'string' && l.name.trim().length > 0)
    .map((leg) => ({
      leg,
      name: leg.name,
      party: typeof leg.party === 'string' ? leg.party.trim() : '',
      vote: toVote(leg.vote),
    }));

  const tally = useMemo(() => {
    const c: Record<VoteValue, number> = { yea: 0, nay: 0, present: 0, absent: 0 };
    for (const r of rows) c[r.vote]++;
    return c;
  }, [rows]);
  const total = Math.max(1, rows.length);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {bill && <div className="rc-bill">{bill}</div>}

      {rows.length === 0 ? (
        <BlockEmpty message="No votes recorded" />
      ) : (
        <>
          <div className="rc-tally">
            <div className="rc-tally-bar">
              {VOTE_ORDER.filter((v) => tally[v] > 0).map((v) => (
                <div
                  key={v}
                  className="rc-tally-seg"
                  style={
                    {
                      width: `${(tally[v] / total) * 100}%`,
                      background: VOTE_COLOR[v],
                    } as CSSProperties
                  }
                  title={`${VOTE_LABEL[v]}: ${tally[v]}`}
                />
              ))}
            </div>
            <div className="rc-tally-labels">
              {VOTE_ORDER.map((v) => (
                <span
                  key={v}
                  className="rc-tally-label"
                  style={{ ['--rc-c' as string]: VOTE_COLOR[v] } as CSSProperties}
                >
                  <span className="rc-tally-dot" /> {tally[v]} {VOTE_LABEL[v]}
                </span>
              ))}
            </div>
          </div>

          <div className="rc-scroll">
            <table className="rc-table">
              <thead>
                <tr>
                  <th className="rc-th">Legislator</th>
                  <th className="rc-th">Party</th>
                  <th className="rc-th rc-th-vote">Vote</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.name}-${i}`}
                    className="rc-row m-stagger-item m-fade-rise"
                    style={
                      {
                        ['--i' as string]: i,
                        ['--rc-party' as string]: partyColor(r.party),
                      } as CSSProperties
                    }
                  >
                    <td className="rc-name">{r.name}</td>
                    <td className="rc-party">{r.party || '—'}</td>
                    <td className="rc-vote-cell">
                      <span
                        className="rc-vote"
                        style={{ ['--rc-c' as string]: VOTE_COLOR[r.vote] } as CSSProperties}
                      >
                        <span className="rc-vote-glyph">{VOTE_GLYPH[r.vote]}</span>
                        {VOTE_LABEL[r.vote]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
