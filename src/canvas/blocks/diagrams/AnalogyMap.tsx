// Analogy map — an unfamiliar concept explained by mapping it part by part onto a familiar one
// ("a private key is like a house key; the public key is like the address on the envelope").
// What the learner already knows sits in the left column, the concept being explained in the
// right, and every mapped part gets its own row with an explicit connector between the halves.
//
// The figure is real HTML rather than a fixed viewBox on purpose: each connector lives INSIDE
// its own row, so it is centred on that row by layout rather than by placement math derived
// from the pair count — two pairs and twenty are equally correct, and a long label wraps and
// grows its own row instead of overflowing or needing a character-count truncation. A container
// query stacks the columns on a narrow card and turns the connectors to point downward, so the
// reading order (known → concept) survives at any width.
//
// `breaksDown` is part of the block rather than a footnote: an analogy that cannot state where
// it stops holding teaches a wrong model, so the disanalogy gets its own labelled panel.
import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AnalogyMapProps, AnalogyPair } from './types';
import { BlockEmpty } from '../../lib/BlockEmpty';
import { richInnerHtml } from '../../../lib/richText';

type Props = AnalogyMapProps & { delay?: number };

/** The entrance stagger stops climbing here, so the last row of a long map still lands promptly
 *  instead of waiting out a delay that grows with the pair count. */
const MAX_STAGGER_INDEX = 11;

function isFilled(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** A row only maps something when BOTH sides carry text — half a pair would draw a connector
 *  to nothing. Nothing here is taken on trust: Live's coercer rejects the malformed shapes
 *  upstream, but the gallery, the topic fixtures, the render gauntlet and the paginate measure
 *  pass all construct these props directly, so a non-array `pairs` (or a side/note that isn't a
 *  string) has to degrade to "nothing mapped" rather than throw — `BlockBoundary`'s fallback is
 *  `null`, so a throw here would silently delete the whole card. */
function mappedPairs(pairs: AnalogyPair[] | undefined): AnalogyPair[] {
  const list: readonly AnalogyPair[] = Array.isArray(pairs) ? pairs : [];
  const rows: AnalogyPair[] = [];
  for (const p of list) {
    if (!p || !isFilled(p.familiar) || !isFilled(p.target)) continue;
    rows.push({
      familiar: p.familiar,
      target: p.target,
      note: isFilled(p.note) ? p.note : undefined,
      // Coerced rather than compared to `true`: a loose flag that arrives as anything truthy
      // draws the dashed, hedged connector, and hedging a match is the safe direction to err.
      loose: !!p.loose,
    });
  }
  return rows;
}

export function AnalogyMap({
  title,
  icon = 'link',
  iconColor = 'var(--presence)',
  familiar,
  target,
  pairs,
  breaksDown,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.link;
  const rows = mappedPairs(pairs);
  const limits: string[] = (Array.isArray(breaksDown) ? breaksDown : []).filter(isFilled);
  const hasLoose = rows.some((p) => p.loose);
  const knownName = isFilled(familiar) ? familiar : '';
  const newName = isFilled(target) ? target : '';
  const captionText = isFilled(caption) ? caption : '';
  // A whitespace-only footer would otherwise render an empty panel *and* suppress the empty
  // state below, so it counts as absent. Non-strings are left to `richInnerHtml`, which coerces.
  const hasFooter = footer != null && String(footer).trim() !== '';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* No mapped pair means no correspondence to draw — the column headers alone would be a
          broken figure, so the whole stage is skipped and the limits/caption still read. */}
      {rows.length > 0 && (
        <div className="ana">
          {/* Headers share the row grid, so each sits exactly over the column it names. */}
          <div className="ana-heads">
            <div className="ana-head ana-head--familiar">
              <span className="ana-head-role">Known</span>
              {knownName && <span className="ana-head-name">{knownName}</span>}
            </div>
            <div className="ana-head-joint">maps onto</div>
            <div className="ana-head ana-head--target">
              <span className="ana-head-role">New</span>
              {newName && <span className="ana-head-name">{newName}</span>}
            </div>
          </div>

          <div className="ana-rows">
            {rows.map((p, i) => (
              <div
                key={i}
                className="ana-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: Math.min(i, MAX_STAGGER_INDEX) } as CSSProperties}
              >
                <div className="ana-side ana-side--familiar">{p.familiar}</div>
                {/* The note rides BETWEEN the two line segments rather than under the rail, so
                    the connector itself stays centred on the row it joins however tall the note
                    (or either side) grows. With no note the segments meet and read as one line. */}
                <div className={p.loose ? 'ana-link ana-link--loose' : 'ana-link'}>
                  <span className="ana-rail">
                    <span className="ana-rail-dot" />
                    <span className="ana-rail-line" />
                    {p.note && <span className="ana-note">{p.note}</span>}
                    <span className="ana-rail-line" />
                    <span className="ana-rail-head" />
                  </span>
                </div>
                <div className="ana-side ana-side--target">{p.target}</div>
              </div>
            ))}
          </div>

          {/* Only meaningful once something is actually drawn dashed. */}
          {hasLoose && <div className="ana-legend">Dashed — the match is only approximate</div>}
        </div>
      )}

      {limits.length > 0 && (
        <div className="ana-limits">
          <div className="ana-limits-head">
            <Icon.alert className="ic" style={{ width: 13, height: 13 }} />
            Where the analogy breaks down
          </div>
          <ul className="ana-limits-list">
            {limits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {captionText && <p className="ana-caption">{captionText}</p>}

      {/* Nothing mapped, no limits, no prose: say so rather than leave a title over blank space. */}
      {rows.length === 0 && limits.length === 0 && !captionText && !hasFooter && (
        <BlockEmpty message="No correspondences to map" />
      )}

      {hasFooter && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
