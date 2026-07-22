// Data archetypes: figure grid, distribution bars, metric tiles, rating matrix, spec table.
import { TrendChart } from './chart';
import { Caption, FitLine, SectionHeading } from './parts';
import type { SectionComponent } from '../types';

/** Bars/tiles wrap to at most 4 across; fewer cells use their own count. */
const cols = (n: number): number => Math.min(n, 4) || 1;

export const FigureGrid: SectionComponent<'figureGrid'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  // A real trend renders as a line/area chart; everything else (bars/ring/funnel) stays a cell grid.
  const chart = data.chart && data.chart.labels.length >= 2 ? data.chart : null;
  return (
    <div>
      <SectionHeading skin={skin} fig={data.fig} label={data.heading} />
      {chart ? (
        <TrendChart chart={chart} skin={skin} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols(data.cells.length)}, 1fr)`,
            gap: 18,
          }}
        >
          {data.cells.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {c.label && (
                <span
                  style={{
                    font: `600 9.5px/1 ${mono}`,
                    letterSpacing: '.14em',
                    color: t.faint,
                    textTransform: 'uppercase',
                  }}
                >
                  {c.label}
                </span>
              )}
              <span
                style={{
                  fontFamily: skin.fonts.display,
                  fontSize: 20,
                  lineHeight: 1.12,
                  color: t.ink,
                }}
              >
                {c.title}
              </span>
              {c.pct != null && (
                <div
                  style={{ height: 5, borderRadius: 3, background: t.track, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round(c.pct * 100)}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
              )}
              {c.value && (
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: 1,
                    letterSpacing: '.04em',
                    color: t.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {c.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {data.caption && <Caption skin={skin} text={data.caption} />}
    </div>
  );
};

export const DistributionBars: SectionComponent<'distributionBars'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      {data.total && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
          <FitLine
            style={{
              fontFamily: skin.fonts.display,
              fontSize: 42,
              lineHeight: 1,
              color: 'var(--accent)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {data.total}
          </FitLine>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.bars.map((b, i) => (
          <div key={i}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                marginBottom: 6,
              }}
            >
              {/* Real content, not bounded by construction — wraps at word boundaries like any
                  other label; flex:1 1 auto claims exactly the row's remaining width (instead of
                  space-between's implicit gap) so a wrapped second line still stops short of the
                  value column. */}
              <span style={{ flex: '1 1 auto', font: `500 13px/1.3 ${mono}`, color: t.ink }}>
                {b.label}
              </span>
              {b.value && (
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: mono,
                    fontSize: 11,
                    fontWeight: 400,
                    lineHeight: 1,
                    color: t.muted,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.value}
                </span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: t.track, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(b.pct * 100)}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

export const MetricTiles: SectionComponent<'metricTiles'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols(data.tiles.length)}, 1fr)`,
          gap: 12,
        }}
      >
        {data.tiles.map((tile, i) => (
          <div
            key={i}
            style={{ padding: 18, background: 'var(--tint)', borderRadius: t.cardRadius }}
          >
            <FitLine
              style={{
                fontFamily: skin.fonts.display,
                fontSize: 28,
                lineHeight: 1.04,
                color: 'var(--accent)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {tile.value}
            </FitLine>
            <div
              style={{
                font: `600 9.5px/1.2 ${mono}`,
                letterSpacing: '.12em',
                color: t.muted,
                marginTop: 8,
                textTransform: 'uppercase',
              }}
            >
              {tile.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const RatingMatrix: SectionComponent<'ratingMatrix'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = Math.max(data.columns.length, data.rows[0]?.values.length ?? 0);
  const grid = `1.4fr repeat(${colCount}, 1fr)`;
  const scale = data.scale ?? 3;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} trailing={`SCALE 1–${scale}`} />
      <div
        style={{ border: `1px solid ${t.rule}`, borderRadius: t.cardRadius, overflow: 'hidden' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: grid,
            background: 'var(--tint)',
            padding: '12px 18px',
            font: `600 10px/1 ${mono}`,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: t.muted,
          }}
        >
          <span />
          {data.columns.map((c, i) => (
            <span key={i} style={{ textAlign: 'center' }}>
              {c}
            </span>
          ))}
        </div>
        {data.rows.map((r, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              alignItems: 'center',
              padding: '15px 18px',
              borderTop: `1px solid ${t.rule}`,
            }}
          >
            <span style={{ fontFamily: skin.fonts.display, fontSize: 19, color: t.ink }}>
              {r.label}
            </span>
            {r.values.map((v, ci) =>
              typeof v === 'number' ? (
                <span key={ci} style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                  {Array.from({ length: scale }, (_, d) => (
                    <i
                      key={d}
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: d < v ? 'var(--accent)' : t.track,
                        display: 'block',
                      }}
                    />
                  ))}
                </span>
              ) : (
                <span
                  key={ci}
                  style={{
                    textAlign: 'center',
                    fontFamily: mono,
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    color: t.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {v}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

export const SpecTable: SectionComponent<'specTable'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = data.columns.length || data.rows[0]?.length || 1;
  const grid = `2fr repeat(${Math.max(colCount - 1, 1)}, 1fr)`;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      {data.columns.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: grid,
            padding: '12px 4px',
            font: `600 10px/1 ${mono}`,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: t.faint,
            borderBottom: `1px solid ${t.rule}`,
          }}
        >
          {data.columns.map((c, i) => (
            <span key={i} style={i === 0 ? undefined : { textAlign: 'center' }}>
              {c}
            </span>
          ))}
        </div>
      )}
      {data.rows.map((r, ri) => {
        const last = ri === data.rows.length - 1;
        return (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              alignItems: 'center',
              padding: '14px 4px',
              borderBottom: last ? 'none' : `1px solid ${t.track}`,
            }}
          >
            {r.map((cell, ci) =>
              ci === 0 ? (
                <span
                  key={ci}
                  style={{ fontFamily: skin.fonts.display, fontSize: 18, color: t.ink }}
                >
                  {cell}
                </span>
              ) : (
                <span
                  key={ci}
                  style={{
                    textAlign: 'center',
                    fontFamily: mono,
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    color: t.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {cell}
                </span>
              ),
            )}
          </div>
        );
      })}
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};
