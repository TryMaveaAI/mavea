import { useRef, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { usePathDraw } from '../../lib';
import type { GitGraphProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GitGraphProps & { delay?: number };

/** One parent→child connector, drawn on with usePathDraw. Its own component (rather than a bare
 *  `<path>` in the map below) so each edge gets its own ref/measurement — commit history only
 *  grows, so a re-render that adds rows mounts fresh connectors (which draw in) alongside
 *  existing ones (whose DOM node — and stable `${child}-${parent}` key — persists, so they don't
 *  replay). */
function GitConnector({ d, color, delay }: { d: string; color: string; delay?: number }) {
  const ref = useRef<SVGPathElement>(null);
  usePathDraw(ref, { delay });
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      opacity={0.85}
    />
  );
}

// Lane palette — branches cycle through the accent tokens so each stays visually distinct.
const LANE_COLORS = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--insight-soft)',
];

const ROW_H = 36;
const LANE_W = 22;
const PAD_X = 16;
const DOT_R = 5.5;
const MAX_ROWS = 14; // keep the graph readable; deeper histories roll up below

// A commit DAG drawn like `git log --graph`: a left SVG column places each commit on its
// branch lane and curves connectors to its parent(s) (two parents render as a merge), while
// an aligned right column lists the hash, message, and any tag / HEAD ref. Pure layout from a
// flat commit list — lanes derive from branch order, positions from row index.
export function GitGraph({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  branches,
  commits,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;
  const all = commits ?? [];
  const rows = all.slice(0, MAX_ROWS);
  const hidden = all.length - rows.length;

  // Lane order: explicit `branches`, else first-seen order in the commits.
  const lanes = branches?.length
    ? branches
    : rows.reduce<string[]>((acc, c) => (acc.includes(c.branch) ? acc : [...acc, c.branch]), []);
  const laneOf = (b: string) => Math.max(0, lanes.indexOf(b));
  const colorOf = (b: string) => LANE_COLORS[laneOf(b) % LANE_COLORS.length];

  const indexById = new Map(rows.map((c, i) => [c.id, i]));
  const laneX = (lane: number) => PAD_X + lane * LANE_W;
  const rowY = (i: number) => i * ROW_H + ROW_H / 2;
  const graphW = PAD_X * 2 + Math.max(0, lanes.length - 1) * LANE_W;
  const totalH = Math.max(ROW_H, rows.length * ROW_H);

  if (rows.length === 0) {
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
        <div className="log-empty">No commits</div>
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
        </div>
      )}

      {lanes.length > 1 && (
        <div className="gg-legend">
          {lanes.map((b, i) => (
            <span key={b} className="gg-leg">
              <span
                className="gg-leg-dot"
                style={{ background: LANE_COLORS[i % LANE_COLORS.length] }}
              />
              {b}
            </span>
          ))}
        </div>
      )}

      <div className="gg">
        <svg
          className="gg-graph"
          width={graphW}
          height={totalH}
          viewBox={`0 0 ${graphW} ${totalH}`}
          style={{ flex: `0 0 ${graphW}px` }}
          aria-hidden="true"
        >
          {/* connectors first, so dots sit on top */}
          {rows.map((c, i) => {
            const cx = laneX(laneOf(c.branch));
            const cy = rowY(i);
            return (c.parents ?? []).map((pid) => {
              const j = indexById.get(pid);
              if (j == null) return null;
              const px = laneX(laneOf(rows[j].branch));
              const py = rowY(j);
              const d =
                cx === px
                  ? `M ${cx} ${cy} L ${px} ${py}`
                  : `M ${cx} ${cy} C ${cx} ${cy + ROW_H * 0.6}, ${px} ${py - ROW_H * 0.6}, ${px} ${py}`;
              return (
                <GitConnector
                  key={`${c.id}-${pid}`}
                  d={d}
                  color={colorOf(rows[j].branch)}
                  delay={delay}
                />
              );
            });
          })}
          {rows.map((c, i) => {
            const cx = laneX(laneOf(c.branch));
            const cy = rowY(i);
            return (
              <g key={c.id}>
                {c.head && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={DOT_R + 3}
                    fill="none"
                    stroke={colorOf(c.branch)}
                    strokeWidth={1.5}
                    opacity={0.5}
                  />
                )}
                <circle cx={cx} cy={cy} r={DOT_R} fill={colorOf(c.branch)} />
              </g>
            );
          })}
        </svg>

        <div className="gg-rows">
          {rows.map((c) => (
            <div className="gg-row" key={c.id} style={{ height: ROW_H }}>
              <span className="gg-hash">{c.id}</span>
              <span className="gg-msg">{c.message}</span>
              {c.tag && <span className="gg-tag">{c.tag}</span>}
              {c.head && <span className="gg-head">HEAD</span>}
            </div>
          ))}
        </div>
      </div>

      {hidden > 0 && <div className="gg-more">+{hidden} older commits</div>}
      {caption && <div className="term-caption">{caption}</div>}
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
