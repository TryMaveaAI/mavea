// Data layouts: the slides that carry numbers — hero figure, bar chart, two-column comparison,
// and the rows × columns table. All use fixed grids + min-width:0 + ellipsis, plus content-length
// type tiers, so dynamic content can never overflow or overlap inside the 1920×1080 frame.
import { Bar, displayWeight, Dots, kickerFont, SlideFrame, surfaceStyle } from '../chrome/bits';
import type { SlideLayout, SlideSkin } from '../types';
import {
  clampStyle,
  inkSafeEllipsis,
  isTightBand,
  KEYFIG_BODY_TIERS,
  KEYFIG_VALUE_TIERS,
  nowrapEllipsis,
  pickTier,
  titleTier,
} from './fit';

/** Shared section heading for the framed data layouts. */
function DataHeading({ skin, text }: { skin: SlideSkin; text: string }) {
  const tier = titleTier(text.length);
  return (
    <div
      data-fit-tier={tier.size}
      style={{
        font: `${displayWeight(skin)} ${tier.size}px/${tier.line} ${skin.fonts.display}`,
        letterSpacing: '-0.015em',
        color: skin.tokens.ink,
        ...clampStyle(tier.maxLines),
      }}
    >
      {text}
    </div>
  );
}

export const KeyFigure: SlideLayout<'keyFigure'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const value = pickTier(d.value.length, KEYFIG_VALUE_TIERS);
  const body = d.body ? pickTier(d.body.length, KEYFIG_BODY_TIERS) : null;
  // Without supporting stats the hero takes the whole frame, centred like a poster figure —
  // a half-empty right column is exactly what reads as an unfinished slide.
  if (!d.stats.length) {
    return (
      <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 18,
            minWidth: 0,
          }}
        >
          <div
            data-fit-tier={value.size}
            style={{
              font: `${displayWeight(skin)} ${value.size}px/${value.line} ${skin.fonts.display}`,
              letterSpacing: '-0.03em',
              color: t.ink,
              maxWidth: '100%',
              ...inkSafeEllipsis,
            }}
          >
            {d.value}
          </div>
          <div
            aria-hidden
            style={{
              width: 110,
              height: 6,
              borderRadius: t.radius > 0 ? 3 : 0,
              background: 'var(--accent)',
              margin: '10px 0',
            }}
          />
          {d.unit ? (
            <div
              style={{
                font: `500 ${skin.fonts.allSerif ? 'italic ' : ''}44px/1.2 ${skin.fonts.display}`,
                color: 'var(--accent-ink)',
                maxWidth: 1100,
                ...clampStyle(2),
              }}
            >
              {d.unit}
            </div>
          ) : null}
          {body ? (
            <div
              style={{
                font: `400 ${body.size}px/${body.line} ${skin.fonts.body}`,
                color: t.muted,
                maxWidth: 960,
                ...clampStyle(body.maxLines),
              }}
            >
              {d.body}
            </div>
          ) : null}
        </div>
      </SlideFrame>
    );
  }
  // At the five-stat cap, Grid/Noir/Press/Cobalt's tighter real band (see `bandFor`) needs a touch
  // less row padding than the roomy default to keep the ledger clearing the footer.
  const atStatCap = d.stats.length >= 5;
  const statPad =
    d.stats.length <= 2 ? 44 : d.stats.length <= 3 ? 34 : isTightBand(skin) && atStatCap ? 22 : 26;
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div style={{ display: 'flex', gap: 96, alignItems: 'center', minWidth: 0 }}>
        {/* Flex column (not block flow) so the value slot's ink-headroom negative margins
            (see nowrapEllipsis) can never collapse with the unit/body marginTop below —
            flex keeps the spacing math exact. */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            data-fit-tier={value.size}
            style={{
              font: `${displayWeight(skin)} ${value.size}px/${value.line} ${skin.fonts.display}`,
              letterSpacing: '-0.03em',
              color: t.ink,
              ...inkSafeEllipsis,
            }}
          >
            {d.value}
          </div>
          {d.unit ? (
            <div
              style={{
                marginTop: 14,
                font: `500 ${skin.fonts.allSerif ? 'italic ' : ''}40px/1.2 ${skin.fonts.display}`,
                color: 'var(--accent-ink)',
                ...clampStyle(2),
              }}
            >
              {d.unit}
            </div>
          ) : null}
          {body ? (
            <div
              style={{
                marginTop: 22,
                font: `400 ${body.size}px/${body.line} ${skin.fonts.body}`,
                color: t.muted,
                maxWidth: 660,
                ...clampStyle(body.maxLines),
              }}
            >
              {d.body}
            </div>
          ) : null}
        </div>
        <div
          style={{
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderBottom: `1px solid ${t.rule}`,
          }}
        >
          {d.stats.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 24,
                padding: `${statPad}px 0`,
                borderTop: `${i === 0 ? 2 : 1}px solid ${i === 0 ? t.ruleStrong : t.rule}`,
              }}
            >
              <span
                style={{
                  font: `500 28px/1.2 ${skin.fonts.body}`,
                  color: t.muted,
                  minWidth: 0,
                  ...nowrapEllipsis,
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  font: `${displayWeight(skin)} 54px/1 ${skin.fonts.display}`,
                  color: t.ink,
                  flex: '0 0 auto',
                  maxWidth: '55%',
                  ...inkSafeEllipsis,
                }}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
};

export const Chart: SlideLayout<'chart'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const hasBars = d.bars.some((b) => typeof b.pct === 'number');
  const n = d.bars.length;
  // Scale the rows to the band: a three-bar chart earns thick bars and large labels, while a
  // full eight-bar chart tightens so it still clears the footer on the roomiest-padded skins.
  const dense = n > 6;
  const labelSize = n <= 4 ? 34 : dense ? 26 : 30;
  const barHeight = n <= 4 ? 22 : dense ? 12 : 16;
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: dense ? 26 : 32,
          minWidth: 0,
        }}
      >
        {d.title ? <DataHeading skin={skin} text={d.title} /> : null}
        {d.body ? (
          <div
            style={{
              font: `400 30px/1.4 ${skin.fonts.body}`,
              color: t.muted,
              maxWidth: 1400,
              ...clampStyle(2),
            }}
          >
            {d.body}
          </div>
        ) : null}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            // Distribute the rows across whatever band is left, so a short chart fills the frame
            // instead of pooling empty space beneath the last bar.
            justifyContent: 'space-evenly',
          }}
        >
          {d.bars.map((b, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', gap: 24, minWidth: 0 }}
              >
                <span
                  style={{
                    font: `600 ${labelSize}px/1.2 ${skin.fonts.body}`,
                    color: t.ink,
                    minWidth: 0,
                    ...nowrapEllipsis,
                  }}
                >
                  {b.label}
                </span>
                {b.value ? (
                  <span
                    style={{
                      font: `600 ${labelSize}px/1.2 ${kickerFont(skin)}`,
                      letterSpacing: '0.04em',
                      color: 'var(--accent-ink)',
                      flex: '0 0 auto',
                      // Bound like KeyFigure's stat value: a long value ("$1.2T (up 45% YoY)")
                      // must ellipsize, not wrap under itself and inflate the row into its neighbors.
                      maxWidth: '45%',
                      ...nowrapEllipsis,
                    }}
                  >
                    {b.value}
                  </span>
                ) : null}
              </div>
              {hasBars ? <Bar skin={skin} pct={b.pct ?? 0} height={barHeight} /> : null}
            </div>
          ))}
        </div>
        {d.total ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTop: `2px solid ${t.ruleStrong}`,
              paddingTop: 22,
              minWidth: 0,
            }}
          >
            <span
              style={{
                font: `700 22px/1 ${kickerFont(skin)}`,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: t.faint,
              }}
            >
              Total
            </span>
            <span
              style={{
                font: `${displayWeight(skin)} 40px/1 ${skin.fonts.display}`,
                color: t.ink,
                flex: '0 0 auto',
                ...inkSafeEllipsis,
              }}
            >
              {d.total}
            </span>
          </div>
        ) : null}
        {d.note ? (
          <div
            style={{
              font: `400 italic 26px/1.4 ${skin.fonts.body}`,
              color: t.faint,
              ...clampStyle(2),
            }}
          >
            {d.note}
          </div>
        ) : null}
      </div>
    </SlideFrame>
  );
};

export const Comparison: SlideLayout<'comparison'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  // Two cards with a handful of rows earn ledger scale; wider grids keep the compact rhythm.
  const maxRows = Math.max(...d.columns.map((c) => c.rows.length));
  const roomy = d.columns.length <= 2 && maxRows <= 5;
  const rowFont = roomy ? 30 : 26;
  // At the five-row cap, Grid/Noir/Press/Cobalt's tighter real band needs a touch less row padding
  // than the roomy default to keep the last row clearing the footer.
  const rowPad = roomy ? (isTightBand(skin) && maxRows === 5 ? 16 : 20) : 12;
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 40,
          minWidth: 0,
        }}
      >
        {d.title ? <DataHeading skin={skin} text={d.title} /> : null}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 40,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${d.columns.length}, 1fr)`,
              gap: 36,
              minWidth: 0,
            }}
          >
            {d.columns.map((col, ci) => {
              const rec = col.recommended;
              const surf = surfaceStyle(skin, { recommended: rec });
              // The recommended column inverts to the dark surface — the deck's clearest "pick this".
              const cardStyle = rec
                ? {
                    ...surf,
                    background: t.darkSurface,
                    color: t.darkInk,
                    border: 'none' as const,
                    borderTop: `3px solid ${t.darkAccent}`,
                  }
                : surf;
              const titleSize = col.title.length > 30 ? 40 : 48;
              return (
                <div
                  key={ci}
                  style={{
                    ...cardStyle,
                    padding: 46,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      minHeight: 40,
                      marginBottom: 18,
                    }}
                  >
                    <span
                      style={{
                        font: `700 24px/1 ${kickerFont(skin)}`,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: rec ? t.darkAccent : 'var(--accent-ink)',
                        ...nowrapEllipsis,
                      }}
                    >
                      {col.label ?? `Option ${ci + 1}`}
                    </span>
                    {rec ? (
                      <span
                        style={{
                          font: `700 18px/1 ${kickerFont(skin)}`,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: t.darkSurface,
                          background: t.darkAccent,
                          padding: '8px 16px',
                          borderRadius: 6,
                          flex: '0 0 auto',
                        }}
                      >
                        Pick
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      font: `${displayWeight(skin)} ${titleSize}px/1.05 ${skin.fonts.display}`,
                      marginBottom: 16,
                      textWrap: 'balance',
                      ...clampStyle(2),
                    }}
                  >
                    {col.title}
                  </div>
                  {col.rows.map((r, ri) => (
                    <div
                      key={ri}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 18,
                        padding: `${rowPad}px 0`,
                        borderTop: `1px solid ${rec ? `color-mix(in oklab, ${t.darkInk} 22%, transparent)` : t.rule}`,
                      }}
                    >
                      <span
                        style={{
                          font: `400 ${rowFont}px/1.3 ${skin.fonts.body}`,
                          color: rec
                            ? `color-mix(in oklab, ${t.darkInk} 78%, transparent)`
                            : t.muted,
                          minWidth: 0,
                          ...nowrapEllipsis,
                        }}
                      >
                        {r.label}
                      </span>
                      <span
                        style={{
                          font: `600 ${rowFont}px/1.3 ${skin.fonts.body}`,
                          flex: '0 0 auto',
                          textAlign: 'right',
                          maxWidth: '55%',
                          ...nowrapEllipsis,
                        }}
                      >
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {d.note ? (
            <div
              style={{
                font: `400 italic 26px/1.4 ${skin.fonts.body}`,
                color: t.faint,
                ...clampStyle(2),
              }}
            >
              {d.note}
            </div>
          ) : null}
        </div>
      </div>
    </SlideFrame>
  );
};

export const DataTable: SlideLayout<'dataTable'> = ({ slide, skin, ctx }) => {
  const t = skin.tokens;
  const d = slide.data;
  const cols = d.columns.length || 1;
  const template =
    `1.6fr ${Array.from({ length: Math.max(0, cols - 1) }, () => '1fr').join(' ')}`.trim();
  // Tighten cell type for wide tables so many columns still fit the measure; a small table earns
  // ledger scale instead — big cells and a roomy rhythm, so three rows still own the frame — and
  // the raised nine-row cap (short cells only) drops to a compact rhythm that still clears the
  // footer on the roomiest-padded skins.
  const wide = cols > 6;
  const small = d.rows.length <= 4 && !wide;
  const packed = d.rows.length >= 8;
  const labelSize = wide || packed ? 32 : small ? 44 : 38;
  const cellSize = wide || packed ? 26 : small ? 34 : 30;
  // At the small tier's four-row cap, Grid/Noir/Press/Cobalt's tighter real band needs a touch less
  // row padding than the roomy default to keep the last row clearing the footer.
  const rowPad = small
    ? isTightBand(skin) && d.rows.length === 4
      ? 34
      : 40
    : packed
      ? 14
      : d.rows.length >= 6
        ? 16
        : 26;
  return (
    <SlideFrame slideId={slide.id} skin={skin} ctx={ctx} kicker={slide.kicker}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          minWidth: 0,
        }}
      >
        {d.title ? <DataHeading skin={skin} text={d.title} /> : null}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 28,
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0, borderBottom: `1px solid ${t.rule}` }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: template,
                gap: 24,
                padding: '0 0 18px',
                font: `700 24px/1 ${kickerFont(skin)}`,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: t.faint,
              }}
            >
              {d.columns.map((c, i) => (
                <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right', ...nowrapEllipsis }}>
                  {c}
                </span>
              ))}
            </div>
            {d.rows.map((row, ri) => (
              <div
                key={ri}
                style={{
                  display: 'grid',
                  gridTemplateColumns: template,
                  gap: 24,
                  alignItems: 'center',
                  padding: `${rowPad}px 0`,
                  borderTop: `${ri === 0 ? 2 : 1}px solid ${ri === 0 ? t.ruleStrong : t.rule}`,
                  minWidth: 0,
                }}
              >
                {row.map((cell, ci) => {
                  const asRating = d.ratingScale && ci > 0 && /^\d+$/.test(cell.trim());
                  return (
                    <span
                      key={ci}
                      style={{
                        textAlign: ci === 0 ? 'left' : 'right',
                        minWidth: 0,
                        justifySelf: ci === 0 ? 'start' : 'end',
                      }}
                    >
                      {asRating ? (
                        <Dots skin={skin} level={Number(cell)} scale={d.ratingScale ?? 3} />
                      ) : (
                        <span
                          style={{
                            font:
                              ci === 0
                                ? `${displayWeight(skin)} ${labelSize}px/1.2 ${skin.fonts.display}`
                                : `500 ${cellSize}px/1.2 ${skin.fonts.body}`,
                            color: ci === 0 ? t.ink : t.muted,
                            display: 'block',
                            ...nowrapEllipsis,
                          }}
                        >
                          {cell}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {d.note ? (
            <div
              style={{
                font: `400 italic 26px/1.4 ${skin.fonts.body}`,
                color: t.faint,
                ...clampStyle(2),
              }}
            >
              {d.note}
            </div>
          ) : null}
        </div>
      </div>
    </SlideFrame>
  );
};
