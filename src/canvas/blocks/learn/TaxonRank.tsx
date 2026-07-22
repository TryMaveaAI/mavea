import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TaxonRankEntry, TaxonRankProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TaxonRankProps & { delay?: number };

// A card this tall reads better in full than scrolling through a dozen sub-ranks — real
// taxonomy answers rarely exceed the canonical seven anyway, so this only ever bites a
// pathological reply.
const MAX_RANKS_SHOWN = 12;
// Pill width narrows toward the top of the ladder (Kingdom) and fills out toward the bottom
// (Species) — the funnel reads as "broader category → more specific taxon" at a glance.
const MIN_WIDTH_PCT = 42;
const MAX_WIDTH_PCT = 100;

interface NormRank {
  key: string;
  level: string;
  name: string;
  highlight: boolean;
}

function normalizeRank(raw: unknown, i: number): NormRank | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<TaxonRankEntry>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null; // a nameless rung has nothing to show
  return {
    key: `r${i}`,
    level: typeof r.level === 'string' && r.level.trim() ? r.level.trim() : 'Rank',
    name,
    highlight: r.highlight === true,
  };
}

// A single organism's classification ladder: one rank pill per rung, widening as it descends,
// joined by a short connector. Every rung comes straight from the data in the order given — no
// tree topology is computed (that's `phylotree`'s job for a multi-species relationship).
export function TaxonRank({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  scientificName,
  ranks,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const list = Array.isArray(ranks) ? ranks : [];
  const norm = list.map(normalizeRank).filter((r): r is NormRank => r !== null);
  const shown = norm.slice(0, MAX_RANKS_SHOWN);
  const hiddenCount = norm.length - shown.length;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {scientificName && <p className="lr-txr-sciname">{scientificName}</p>}

      {shown.length === 0 ? (
        <div className="lr-txr-empty">No classification ranks to show.</div>
      ) : (
        <ol className="lr-txr-ladder">
          {shown.map((r, i) => {
            const t = shown.length > 1 ? i / (shown.length - 1) : 1;
            const widthPct = MIN_WIDTH_PCT + t * (MAX_WIDTH_PCT - MIN_WIDTH_PCT);
            return (
              <li
                key={r.key}
                className="lr-txr-rung m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                {i > 0 && <span className="lr-txr-connector" aria-hidden="true" />}
                <div
                  className={'lr-txr-pill' + (r.highlight ? ' lr-txr-pill--hot' : '')}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="lr-txr-level">{r.level}</span>
                  <span className="lr-txr-name">{r.name}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {hiddenCount > 0 && <p className="lr-txr-more">+{hiddenCount} more ranks</p>}

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
