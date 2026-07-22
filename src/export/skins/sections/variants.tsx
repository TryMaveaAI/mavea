// Per-skin section overrides — where a template's reference diverges structurally from the shared
// renderer. The architecture already supports this (a skin's `sections` map wins over SHARED_SECTIONS);
// these give the most-divergent skins their signature body voice instead of "one layout, recoloured":
//   • Financial → a right-aligned tabular-nums LEDGER with up/down-coloured signed deltas.
//   • Swiss     → a hard-ruled bordered GRID (black rules, no radius) — the international-typographic look.
//   • Terminal  → a framed CONSOLE panel with mono rows and a `›` prompt marker.
//   • Luxury    → an ✦-ornamented, italic-meta editorial list.
//   • Legal     → roman-numeral section numbering.
//   • Medical   → a clinical-record card with status pills.
//   • School    → a gradebook card with letter-grade badges.
//   • Research   → an academic prose block with a left accent rule + justified measure.
// All token-driven and real-data-only (they render exactly the cells/rows normalize produced).
import { Caption, SectionHeading } from './parts';
import type { SectionComponent } from '../types';

/** Roman numerals for Legal's section numbering (I, II, III…). Small inputs in practice. */
function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [val, sym] of map)
    while (v >= val) {
      out += sym;
      v -= val;
    }
  return out;
}

/** A cell's signed-delta direction by its leading glyph: +1 up, -1 down, 0 plain. */
function deltaDir(cell: string): 1 | -1 | 0 {
  const c = cell.trim();
  if (/^\+/.test(c)) return 1;
  if (/^[-−–]/.test(c)) return -1;
  return 0;
}

/* ── Financial: a numeric ledger ─────────────────────────────────────────────── */

export const FinancialSpecTable: SectionComponent<'specTable'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = data.columns.length || data.rows[0]?.length || 1;
  const grid = `1.8fr repeat(${Math.max(colCount - 1, 1)}, 1fr)`;
  const up = t.pos ?? 'var(--accent)';
  const down = t.neg ?? t.muted;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      {data.columns.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: grid,
            padding: '10px 6px',
            font: `600 10px/1 ${mono}`,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: t.faint,
            borderBottom: `1.5px solid ${t.ruleStrong}`,
          }}
        >
          {data.columns.map((c, i) => (
            <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>
              {c}
            </span>
          ))}
        </div>
      )}
      {data.rows.map((r, ri) => (
        <div
          key={ri}
          style={{
            display: 'grid',
            gridTemplateColumns: grid,
            alignItems: 'baseline',
            padding: '12px 6px',
            borderBottom: ri === data.rows.length - 1 ? 'none' : `1px solid ${t.track}`,
          }}
        >
          {r.map((cell, ci) => {
            if (ci === 0)
              return (
                <span
                  key={ci}
                  style={{ fontFamily: skin.fonts.display, fontSize: 16, color: t.ink }}
                >
                  {cell}
                </span>
              );
            const dir = deltaDir(cell);
            return (
              <span
                key={ci}
                style={{
                  textAlign: 'right',
                  fontFamily: mono,
                  fontSize: 13,
                  fontWeight: dir ? 600 : 500,
                  lineHeight: 1.3,
                  fontVariantNumeric: 'tabular-nums',
                  color: dir === 1 ? up : dir === -1 ? down : t.ink,
                }}
              >
                {dir === 1 && !/^\+/.test(cell.trim()) ? `+${cell}` : cell}
              </span>
            );
          })}
        </div>
      ))}
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

/* ── Swiss: a hard-ruled bordered grid ───────────────────────────────────────── */

export const SwissSpecTable: SectionComponent<'specTable'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = data.columns.length || data.rows[0]?.length || 1;
  const grid = `1.6fr repeat(${Math.max(colCount - 1, 1)}, 1fr)`;
  const cell = (first: boolean, head: boolean): React.CSSProperties => ({
    padding: '11px 14px',
    borderLeft: first ? 'none' : `1px solid ${t.ruleStrong}`,
    textAlign: first ? 'left' : 'center',
    ...(head
      ? {
          font: `700 10px/1.1 ${mono}`,
          letterSpacing: '.08em',
          textTransform: 'uppercase' as const,
          color: t.ink,
        }
      : {
          fontFamily: mono,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.3,
          color: t.muted,
          fontVariantNumeric: 'tabular-nums' as const,
        }),
  });
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ border: `2px solid ${t.ruleStrong}` }}>
        {data.columns.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              borderBottom: `2px solid ${t.ruleStrong}`,
            }}
          >
            {data.columns.map((c, i) => (
              <span key={i} style={cell(i === 0, true)}>
                {c}
              </span>
            ))}
          </div>
        )}
        {data.rows.map((r, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              borderTop: ri === 0 ? 'none' : `1px solid ${t.ruleStrong}`,
            }}
          >
            {r.map((c, ci) => (
              <span
                key={ci}
                style={
                  ci === 0
                    ? { ...cell(true, false), fontFamily: skin.fonts.display, color: t.ink }
                    : cell(false, false)
                }
              >
                {c}
              </span>
            ))}
          </div>
        ))}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

/* ── Terminal: a framed console panel ────────────────────────────────────────── */

export const TerminalSpecTable: SectionComponent<'specTable'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = data.columns.length || data.rows[0]?.length || 1;
  const grid = `16px 1.6fr repeat(${Math.max(colCount - 1, 1)}, 1fr)`;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div
        style={{
          border: `1px solid ${t.rule}`,
          borderRadius: t.cardRadius,
          background: t.tint,
          overflow: 'hidden',
          font: `400 12.5px/1.5 ${mono}`,
        }}
      >
        {data.columns.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              padding: '9px 14px',
              borderBottom: `1px solid ${t.rule}`,
              color: 'var(--accent)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            <span />
            {data.columns.map((c, i) => (
              <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>
                {c}
              </span>
            ))}
          </div>
        )}
        {data.rows.map((r, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              alignItems: 'baseline',
              padding: '8px 14px',
              borderTop: ri === 0 ? 'none' : `1px solid ${t.rule}`,
            }}
          >
            <span style={{ color: 'var(--accent)' }}>›</span>
            {r.map((c, ci) => (
              <span
                key={ci}
                style={{
                  textAlign: ci === 0 ? 'left' : 'right',
                  color: ci === 0 ? t.ink : t.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c}
              </span>
            ))}
          </div>
        ))}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

/* ── Luxury: an ornamented, italic editorial list ────────────────────────────── */

export const LuxuryRankedList: SectionComponent<'rankedList'> = ({ data, skin }) => {
  const t = skin.tokens;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.items.map((it, i) => {
          const last = i === data.items.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 18,
                padding: '15px 0',
                borderBottom: last ? 'none' : `1px solid ${t.rule}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{ fontFamily: skin.fonts.display, fontSize: 15, color: 'var(--accent)' }}
                >
                  ✦
                </span>
                <span
                  style={{
                    fontFamily: skin.fonts.display,
                    fontSize: 20,
                    color: it.hot ? 'var(--accent)' : t.ink,
                  }}
                >
                  {it.name}
                </span>
              </span>
              {it.meta && (
                <span
                  style={{
                    fontFamily: skin.fonts.display,
                    fontStyle: 'italic',
                    fontSize: 13.5,
                    color: t.muted,
                    textAlign: 'right',
                    flex: 'none',
                  }}
                >
                  {it.meta}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

/* ── Legal: roman-numeral section numbering ──────────────────────────────────── */

export const LegalNumberedMilestones: SectionComponent<'numberedMilestones'> = ({ data, skin }) => {
  const t = skin.tokens;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.items.map((it, i) => {
          const last = i === data.items.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 1fr',
                gap: 18,
                alignItems: 'baseline',
                padding: '14px 0',
                borderBottom: last ? 'none' : `1px solid ${t.rule}`,
              }}
            >
              <span
                style={{
                  fontFamily: skin.fonts.display,
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  letterSpacing: '.04em',
                }}
              >
                {toRoman(i + 1)}.
              </span>
              <div>
                <div style={{ fontFamily: skin.fonts.display, fontSize: 19, color: t.ink }}>
                  {it.title}
                </div>
                {it.body && (
                  <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.55, color: t.muted }}>
                    {it.body}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Medical: a clinical record card with status pills ───────────────────────── */

/** A letter grade (A+, B, C-, F…) or pass/fail token — School renders these as a badge. */
const LETTER_GRADE = /^([A-F][+-]?|Pass|Fail|Honou?rs?|Merit|Distinction)$/i;

const CLINICAL_STATUS =
  /^(normal|optimal|stable|pass|within range|high|low|elevated|reduced|critical|flag|abnormal|borderline)$/i;
/** Status words that read as "all good" get the accent pill; the rest an outlined caution pill. */
const GOOD = /^(normal|optimal|stable|pass|within range)$/i;

export const MedicalSpecTable: SectionComponent<'specTable'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = data.columns.length || data.rows[0]?.length || 1;
  const grid = `1.6fr repeat(${Math.max(colCount - 1, 1)}, 1fr)`;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div
        style={{
          border: `1px solid ${t.rule}`,
          borderRadius: t.cardRadius,
          overflow: 'hidden',
        }}
      >
        {data.columns.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              padding: '11px 18px',
              background: 'var(--tint)',
              font: `600 9.5px/1 ${mono}`,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: t.muted,
            }}
          >
            {data.columns.map((c, i) => (
              <span key={i} style={{ textAlign: i === 0 ? 'left' : 'center' }}>
                {c}
              </span>
            ))}
          </div>
        )}
        {data.rows.map((r, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              alignItems: 'center',
              padding: '12px 18px',
              borderTop: `1px solid ${t.rule}`,
            }}
          >
            {r.map((cell, ci) => {
              if (ci === 0)
                return (
                  <span
                    key={ci}
                    style={{ fontFamily: skin.fonts.display, fontSize: 16, color: t.ink }}
                  >
                    {cell}
                  </span>
                );
              const isStatus = CLINICAL_STATUS.test(cell.trim());
              if (isStatus) {
                const good = GOOD.test(cell.trim());
                return (
                  <span key={ci} style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        font: `600 10px/1.4 ${mono}`,
                        letterSpacing: '.04em',
                        textTransform: 'uppercase',
                        ...(good
                          ? { background: 'var(--tint)', color: 'var(--accent)' }
                          : { border: `1px solid ${t.muted}`, color: t.muted }),
                      }}
                    >
                      {cell}
                    </span>
                  </span>
                );
              }
              return (
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
              );
            })}
          </div>
        ))}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

/* ── School: a gradebook card with letter-grade badges ───────────────────────── */

export const SchoolSpecTable: SectionComponent<'specTable'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const colCount = data.columns.length || data.rows[0]?.length || 1;
  const grid = `1.8fr repeat(${Math.max(colCount - 1, 1)}, 1fr)`;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading} />
      <div
        style={{ border: `1px solid ${t.rule}`, borderRadius: t.cardRadius, overflow: 'hidden' }}
      >
        {data.columns.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              padding: '11px 18px',
              background: 'var(--tint)',
              font: `600 9.5px/1 ${mono}`,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: t.muted,
            }}
          >
            {data.columns.map((c, i) => (
              <span key={i} style={{ textAlign: i === 0 ? 'left' : 'center' }}>
                {c}
              </span>
            ))}
          </div>
        )}
        {data.rows.map((r, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              alignItems: 'center',
              padding: '12px 18px',
              borderTop: `1px solid ${t.rule}`,
            }}
          >
            {r.map((cell, ci) => {
              if (ci === 0)
                return (
                  <span
                    key={ci}
                    style={{ fontFamily: skin.fonts.display, fontSize: 16, color: t.ink }}
                  >
                    {cell}
                  </span>
                );
              if (LETTER_GRADE.test(cell.trim()))
                return (
                  <span key={ci} style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 30,
                        height: 30,
                        padding: '0 8px',
                        borderRadius: 999,
                        border: `1.5px solid var(--accent)`,
                        fontFamily: skin.fonts.display,
                        fontWeight: 600,
                        fontSize: 14,
                        color: 'var(--accent)',
                      }}
                    >
                      {cell}
                    </span>
                  </span>
                );
              return (
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
              );
            })}
          </div>
        ))}
      </div>
      {data.note && <Caption skin={skin} text={data.note} />}
    </div>
  );
};

/* ── Research: an academic prose block (left accent rule, justified measure) ──── */

export const ResearchProse: SectionComponent<'prose'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div style={{ borderLeft: `2px solid var(--accent)`, paddingLeft: 22 }}>
      {data.heading && (
        <div
          style={{
            font: `600 9.5px/1 ${mono}`,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 9,
          }}
        >
          {data.heading}
        </div>
      )}
      {data.body && (
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.7,
            color: t.muted,
            textAlign: 'justify',
            hyphens: 'auto',
          }}
        >
          {data.body}
        </p>
      )}
    </div>
  );
};
