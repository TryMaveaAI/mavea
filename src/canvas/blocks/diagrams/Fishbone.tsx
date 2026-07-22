// Fishbone — an Ishikawa cause-effect diagram. All geometry is computed from the counts that
// actually arrive: category ribs pair up along the spine (top/bottom alternating, up to 8),
// rib height grows with the deepest cause list, and twig length shrinks as pairs pack tighter,
// so a 3-category sketch and a full 6M analysis both read like the textbook figure. Nothing is
// hardcoded to the classic 6M set — the ribs are whatever the analysis used.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FishboneProps, FishboneCategory } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { fitText } from '../../lib/fitText';
import { BlockEmpty } from '../../lib/BlockEmpty';

type Props = FishboneProps & { delay?: number };

const VIEW_W = 1000;
const PAD = 18;
const TAIL_W = 26;
const HEAD_W = 152;
const HEAD_H = 84;
const MAX_RIBS = 8;
// Ribs run at ~60° to the spine: one unit of rise costs tan(30°) ≈ 0.577 units of run.
const RIB_RUN = 0.577;
const CAT_F = 15; // category label font size
const CAUSE_F = 12.5;

// Ribs cycle a small accent palette so each category reads as its own branch at a glance.
const RIB_ACCENTS = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--presence-deep)'];

/** Categories and their cause lists arrive as loose JSON — flatten objectified causes
 *  (`{text: "..."}` where a plain string was expected) back to readable strings. */
function normalizeCategories(input: unknown): { label: string; causes: string[] }[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (typeof raw === 'string') return { label: raw, causes: [] };
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Partial<FishboneCategory> & Record<string, unknown>;
      const label = typeof r.label === 'string' && r.label ? r.label : '';
      const rawCauses = Array.isArray(r.causes) ? r.causes : [];
      const causes = rawCauses
        .map((c) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object') {
            const o = c as Record<string, unknown>;
            const t = o.text ?? o.label ?? o.cause ?? o.name;
            return typeof t === 'string' ? t : '';
          }
          return '';
        })
        .filter(Boolean);
      return label || causes.length ? { label: label || '—', causes } : null;
    })
    .filter((c): c is { label: string; causes: string[] } => c !== null)
    .slice(0, MAX_RIBS);
}

export function Fishbone({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  effect,
  categories,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const uid = useId().replace(/:/g, '');

  const cats = useMemo(() => normalizeCategories(categories), [categories]);

  const geo = useMemo(() => {
    if (!cats.length) return null;
    const maxCauses = Math.max(0, ...cats.map((c) => c.causes.length));
    // The rib must seat every twig with breathing room; clamp so one crowded rib can't
    // balloon the whole figure.
    const ribH = Math.min(240, Math.max(96, 40 + maxCauses * 32));
    const ribDx = ribH * RIB_RUN;
    const H = ribH * 2 + 110; // 55px per side for the tip labels
    const spineY = H / 2;
    const spineX1 = PAD + TAIL_W;
    const spineX2 = VIEW_W - PAD - HEAD_W - 10;

    const pairs = Math.max(1, Math.ceil(cats.length / 2));
    const usable = spineX2 - spineX1 - ribDx;
    const pairStep = usable / pairs;
    const twigLen = Math.min(150, Math.max(70, pairStep * 0.72));

    const ribs = cats.map((cat, i) => {
      const pair = Math.floor(i / 2);
      const top = i % 2 === 0;
      const jx = spineX1 + ribDx + pairStep * (pair + 0.62);
      const tipX = jx - ribDx;
      const tipY = top ? spineY - ribH : spineY + ribH;
      return { cat, top, jx, tipX, tipY, accent: RIB_ACCENTS[i % RIB_ACCENTS.length] };
    });

    return { ribH, ribDx, H, spineY, spineX1, spineX2, twigLen, ribs };
  }, [cats]);

  const effectFit = useMemo(
    () =>
      fitText(typeof effect === 'string' && effect ? effect : '—', {
        maxWidth: HEAD_W - 22,
        fontSize: 16,
        minFontSize: 11,
        maxLines: 3,
        lineHeight: 1.2,
        bold: true,
      }),
    [effect],
  );

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {!geo ? (
        <BlockEmpty message="No cause categories to draw" />
      ) : (
        <div className="dg-stage fsb-stage">
          <svg viewBox={`0 0 ${VIEW_W} ${geo.H}`} className="dg-svg" role="img" aria-label={title}>
            <defs>
              <marker
                id={`fsb-arrow-${uid}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 z" className="fsb-arrowhead" />
              </marker>
            </defs>

            {/* tail + spine + head */}
            <polygon
              className="fsb-tail"
              points={`${PAD},${geo.spineY - 13} ${PAD},${geo.spineY + 13} ${PAD + TAIL_W},${geo.spineY}`}
            />
            <line
              className="fsb-spine"
              x1={geo.spineX1}
              y1={geo.spineY}
              x2={geo.spineX2}
              y2={geo.spineY}
              markerEnd={`url(#fsb-arrow-${uid})`}
            />
            <rect
              className="fsb-head"
              x={geo.spineX2 + 10}
              y={geo.spineY - HEAD_H / 2}
              width={HEAD_W}
              height={HEAD_H}
              rx={12}
            />
            <text className="fsb-effect" textAnchor="middle" fontSize={effectFit.fontSize}>
              {effectFit.lines.map((ln, i) => (
                <tspan
                  key={i}
                  x={geo.spineX2 + 10 + HEAD_W / 2}
                  y={
                    geo.spineY -
                    ((effectFit.lines.length - 1) * effectFit.lineHeightPx) / 2 +
                    i * effectFit.lineHeightPx
                  }
                  dominantBaseline="middle"
                >
                  {ln}
                </tspan>
              ))}
            </text>

            {/* ribs, tip labels, and cause twigs */}
            {geo.ribs.map((rib, i) => {
              const m = rib.cat.causes.length;
              const twigGap = geo.ribH / (m + 1);
              // A cramped rib (many causes) drops to single-line twigs so neighbours never touch.
              const twigLines = twigGap >= 30 ? 2 : 1;
              const labelFit = fitText(rib.cat.label, {
                maxWidth: 132,
                fontSize: CAT_F,
                minFontSize: 11,
                maxLines: 2,
                lineHeight: 1.15,
                bold: true,
              });
              const labelH = labelFit.lines.length * labelFit.lineHeightPx;
              // Stack the tip label away from the rib: upward for top ribs, downward for bottom.
              const labelY0 = rib.top
                ? rib.tipY - 10 - labelH + labelFit.lineHeightPx / 2
                : rib.tipY + 10 + labelFit.lineHeightPx / 2;

              return (
                <g key={i}>
                  <line
                    className="fsb-rib"
                    x1={rib.jx}
                    y1={geo.spineY}
                    x2={rib.tipX}
                    y2={rib.tipY}
                    style={{ stroke: rib.accent }}
                  />
                  <text
                    className="fsb-cat"
                    textAnchor="middle"
                    fontSize={labelFit.fontSize}
                    style={{ fill: rib.accent }}
                  >
                    {labelFit.lines.map((ln, j) => (
                      <tspan
                        key={j}
                        x={rib.tipX}
                        y={labelY0 + j * labelFit.lineHeightPx}
                        dominantBaseline="middle"
                      >
                        {ln}
                      </tspan>
                    ))}
                  </text>

                  {rib.cat.causes.map((cause, k) => {
                    // causes[0] rides nearest the tip, later ones step toward the spine.
                    const t = (m - k) / (m + 1);
                    const px = rib.jx - geo.ribDx * t;
                    const py = rib.top ? geo.spineY - geo.ribH * t : geo.spineY + geo.ribH * t;
                    const endX = Math.max(PAD + 4, px - geo.twigLen);
                    const fit = fitText(cause, {
                      maxWidth: Math.max(40, px - endX - 10),
                      fontSize: CAUSE_F,
                      minFontSize: 9,
                      maxLines: twigLines,
                      lineHeight: 1.15,
                    });
                    // Text stacks on the side of the twig AWAY from the spine, so a twig
                    // sitting nearest the spine can never run its label across it.
                    const lineY = (j: number) =>
                      rib.top
                        ? py - 4 - (fit.lines.length - 1 - j + 0.5) * fit.lineHeightPx
                        : py + 4 + (j + 0.5) * fit.lineHeightPx;
                    return (
                      <g key={k}>
                        <line className="fsb-twig" x1={px} y1={py} x2={endX} y2={py} />
                        <text className="fsb-cause" textAnchor="end" fontSize={fit.fontSize}>
                          {fit.lines.map((ln, j) => (
                            <tspan key={j} x={px - 8} y={lineY(j)} dominantBaseline="middle">
                              {ln}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
