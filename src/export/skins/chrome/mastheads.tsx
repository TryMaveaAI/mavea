// Per-template mastheads — the structurally distinct page-1 headers that give each skin its
// identity (Swiss's giant numeral, the clinical record grid, the legal memo block, …). They are
// adaptations of the reference designs populated with the answer's REAL metadata (title, sub,
// topic, date, sources) — never fabricated patient IDs, author names, or returns (real-data-only).
import type { ExportMeta } from '../../model/ExportDoc';
import type { MastheadComponent, TemplateSkin } from '../types';
import { fullDate, issueNumber, monthYear } from './dates';

const mono = (s: TemplateSkin): string => s.fonts.mono ?? s.fonts.body;
const dw = (s: TemplateSkin): number => s.fonts.displayWeight ?? 400;

/** "READING · a · b" provenance caption, or null. Shared by the mastheads that show sources inline. */
function sourceLine(meta: ExportMeta, skin: TemplateSkin) {
  if (!meta.sources.length) return null;
  const shown = meta.sources
    .slice(0, 4)
    .map((s) => s.name)
    .join('  ·  ');
  const extra = meta.sources.length > 4 ? `  +${meta.sources.length - 4}` : '';
  return (
    <div
      style={{
        marginTop: 18,
        font: `500 9.5px/1.4 ${mono(skin)}`,
        letterSpacing: '.08em',
        color: skin.tokens.faint,
      }}
    >
      READING · {shown}
      {extra}
    </div>
  );
}

export const SwissMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 16,
          borderBottom: `2px solid ${t.ink}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span
            style={{
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: '-.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {skin.brand.name}
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color: t.muted, whiteSpace: 'nowrap' }}>
            {skin.brand.tagline}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}
        >
          {meta.topic || 'Report'}
        </span>
      </div>
      <div
        style={{
          paddingTop: 30,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 30,
          alignItems: 'end',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              color: t.muted,
              marginBottom: 14,
            }}
          >
            No. {issueNumber(meta.num)} / {monthYear(meta.generatedAt)}
          </div>
          <h1
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: 60,
              lineHeight: 0.94,
              letterSpacing: '-.035em',
            }}
          >
            {meta.title}
          </h1>
        </div>
        <div
          style={{
            fontWeight: 900,
            fontSize: 84,
            lineHeight: 0.8,
            letterSpacing: '-.05em',
            color: 'var(--accent)',
          }}
        >
          01
        </div>
      </div>
      {meta.sub && (
        <p
          style={{
            margin: '20px 0 0',
            fontSize: 16,
            lineHeight: 1.45,
            fontWeight: 500,
            maxWidth: 600,
          }}
        >
          {meta.sub}
        </p>
      )}
      {sourceLine(meta, skin)}
    </header>
  );
};

export const LuxuryMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header style={{ textAlign: 'center' }}>
      <div style={{ borderBottom: `1px solid ${t.rule}`, paddingBottom: 18 }}>
        <div
          style={{
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 22,
            letterSpacing: '.42em',
            paddingLeft: '.42em',
            whiteSpace: 'nowrap',
          }}
        >
          {skin.brand.name}
        </div>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '.3em',
            textTransform: 'uppercase',
            color: t.faint,
            marginTop: 8,
            whiteSpace: 'nowrap',
          }}
        >
          {skin.brand.tagline}
        </div>
      </div>
      <div style={{ paddingTop: 38 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '.3em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 18,
            whiteSpace: 'nowrap',
          }}
        >
          {meta.topic ? `${meta.topic} · ` : ''}No. {issueNumber(meta.num)}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 58,
            lineHeight: 1.0,
            letterSpacing: '-.005em',
          }}
        >
          {meta.title}
        </h1>
        <div
          style={{ width: 54, height: 1.5, background: 'var(--accent)', margin: '22px auto 0' }}
        />
        {meta.sub && (
          <p
            style={{
              margin: '22px auto 0',
              maxWidth: 480,
              fontSize: 15,
              lineHeight: 1.65,
              color: t.muted,
            }}
          >
            {meta.sub}
          </p>
        )}
      </div>
    </header>
  );
};

/** A small medical cross glyph (two white bars on the accent tile). */
function Cross() {
  return (
    <span style={{ position: 'relative', width: 14, height: 14, display: 'inline-block' }}>
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 5.75,
          width: 14,
          height: 2.5,
          background: '#fff',
          borderRadius: 1,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 5.75,
          top: 0,
          width: 2.5,
          height: 14,
          background: '#fff',
          borderRadius: 1,
        }}
      />
    </span>
  );
}

export const MedicalMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  const cells: [string, string][] = [
    ['DATE', monthYear(meta.generatedAt)],
    ['SOURCES', meta.sources.length ? String(meta.sources.length) : '—'],
    ['PREPARED BY', skin.brand.name],
  ];
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 18,
          borderBottom: `2px solid var(--accent)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cross />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
              {skin.brand.name}
            </span>
            <span
              style={{ font: `400 9.5px/1 ${mono(skin)}`, color: t.faint, whiteSpace: 'nowrap' }}
            >
              {skin.brand.tagline}
            </span>
          </div>
        </div>
        <span
          style={{
            font: `600 10px/1 ${mono(skin)}`,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}
        >
          {/* The topic only — never the template's own domain word: a reader picks this look
              for its style, and their finance answer must not come out stamped "Clinical". */}
          {meta.topic || 'Summary'}
        </span>
      </div>
      <div style={{ paddingTop: 24 }}>
        <div
          style={{
            font: `500 10px/1 ${mono(skin)}`,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: t.faint,
            marginBottom: 12,
          }}
        >
          Summary · {monthYear(meta.generatedAt)}
        </div>
        <h1
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: 40,
            lineHeight: 1.04,
            letterSpacing: '-.02em',
          }}
        >
          {meta.title}
        </h1>
        {meta.sub && (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 14.5,
              lineHeight: 1.55,
              color: t.muted,
              maxWidth: 620,
            }}
          >
            {meta.sub}
          </p>
        )}
        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 1,
            background: t.rule,
            border: `1px solid ${t.rule}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {cells.map(([k, v]) => (
            <div key={k} style={{ background: t.pageBg, padding: '13px 16px' }}>
              <div
                style={{ font: `500 8.5px/1 ${mono(skin)}`, letterSpacing: '.1em', color: t.faint }}
              >
                {k}
              </div>
              <div style={{ font: `500 13px/1.2 ${mono(skin)}`, marginTop: 6, color: t.ink }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};

export const SchoolMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header>
      <div
        style={{ textAlign: 'center', borderBottom: `2px solid var(--accent)`, paddingBottom: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span
            style={{
              width: 34,
              height: 34,
              border: `2px solid var(--accent)`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: skin.fonts.display,
              fontWeight: 600,
              fontSize: 16,
              color: 'var(--accent)',
            }}
          >
            {skin.brand.name.charAt(0)}
          </span>
          <span
            style={{
              fontFamily: skin.fonts.display,
              fontWeight: 600,
              fontSize: 22,
              letterSpacing: '.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {skin.brand.name}
          </span>
        </div>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: '.28em',
            textTransform: 'uppercase',
            color: t.faint,
            marginTop: 10,
          }}
        >
          {skin.brand.tagline}
        </div>
      </div>
      <div style={{ textAlign: 'center', paddingTop: 28 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 14,
          }}
        >
          {meta.topic ? `${meta.topic} · ` : ''}
          {monthYear(meta.generatedAt)}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 42,
            lineHeight: 1.04,
          }}
        >
          {meta.title}
        </h1>
        {meta.sub && (
          <p
            style={{
              margin: '14px auto 0',
              maxWidth: 540,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: t.muted,
            }}
          >
            {meta.sub}
          </p>
        )}
      </div>
    </header>
  );
};

export const FinancialMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 18,
          borderBottom: `2px solid var(--accent)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: skin.fonts.display,
              fontWeight: 600,
              fontSize: 17,
            }}
          >
            {skin.brand.name.charAt(0)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: '-.01em',
                whiteSpace: 'nowrap',
              }}
            >
              {skin.brand.name}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 500, color: t.faint, whiteSpace: 'nowrap' }}>
              {skin.brand.tagline}
            </span>
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}
        >
          {meta.topic || 'Brief'}
        </span>
      </div>
      <div style={{ paddingTop: 24 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: t.faint,
            marginBottom: 12,
          }}
        >
          No. {issueNumber(meta.num)} · {monthYear(meta.generatedAt)}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 44,
            lineHeight: 1.0,
            letterSpacing: '-.02em',
          }}
        >
          {meta.title}
        </h1>
        {meta.sub && (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 14.5,
              lineHeight: 1.55,
              color: t.muted,
              maxWidth: 620,
            }}
          >
            {meta.sub}
          </p>
        )}
        {sourceLine(meta, skin)}
      </div>
    </header>
  );
};

export const ResearchMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 16,
          borderBottom: `1px solid ${t.ink}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: skin.fonts.display,
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            {skin.brand.name.charAt(0)}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
            {skin.brand.name}
          </span>
        </div>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}
        >
          Preprint · Not Peer-Reviewed
        </span>
      </div>
      <div style={{ paddingTop: 28 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: t.faint,
            marginBottom: 14,
          }}
        >
          {meta.topic ? `${meta.topic} · ` : ''}
          {monthYear(meta.generatedAt)}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 36,
            lineHeight: 1.12,
            letterSpacing: '-.01em',
            maxWidth: 680,
          }}
        >
          {meta.title}
        </h1>
        {meta.sub && (
          <p
            style={{
              margin: '14px 0 0',
              fontFamily: skin.fonts.display,
              fontSize: 14,
              lineHeight: 1.6,
              color: t.muted,
              maxWidth: 680,
            }}
          >
            {meta.sub}
          </p>
        )}
      </div>
    </header>
  );
};

export const EditorialMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingBottom: 14,
          borderBottom: `1px solid ${t.ruleStrong}`,
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            style={{
              font: `600 16px/1 ${mono(skin)}`,
              letterSpacing: '.34em',
              color: t.ink,
              whiteSpace: 'nowrap',
            }}
          >
            {skin.brand.name}
          </span>
          <span style={{ font: `400 11px/1 ${mono(skin)}`, color: t.muted, whiteSpace: 'nowrap' }}>
            {skin.brand.tagline}
          </span>
        </div>
        {meta.topic && (
          <span
            style={{
              font: `500 10px/1 ${mono(skin)}`,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              whiteSpace: 'nowrap',
            }}
          >
            {meta.topic}
          </span>
        )}
      </div>
      <div style={{ paddingTop: 28 }}>
        <div
          style={{
            font: `500 10.5px/1 ${mono(skin)}`,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: t.faint,
            marginBottom: 14,
          }}
        >
          No. {issueNumber(meta.num)} · {monthYear(meta.generatedAt)}
        </div>
        {/* The signature Editorial flourish: an accent-coloured period closing the headline. */}
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 56,
            lineHeight: 1.0,
            letterSpacing: '-.01em',
            color: t.ink,
          }}
        >
          {meta.title}
          <span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        {meta.sub && (
          <p
            style={{
              margin: '16px 0 0',
              maxWidth: 580,
              fontSize: 15.5,
              lineHeight: 1.55,
              color: t.muted,
            }}
          >
            {meta.sub}
          </p>
        )}
        {sourceLine(meta, skin)}
      </div>
    </header>
  );
};

export const ExecutiveMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 14,
          borderBottom: `1px solid ${t.ruleStrong}`,
          gap: 16,
        }}
      >
        <span
          style={{
            font: `600 15px/1 ${mono(skin)}`,
            letterSpacing: '.28em',
            color: t.ink,
            whiteSpace: 'nowrap',
          }}
        >
          {skin.brand.name}
        </span>
        <span
          style={{
            font: `700 9px/1 ${mono(skin)}`,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            border: `1px solid var(--accent)`,
            borderRadius: 3,
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          Confidential
        </span>
      </div>
      <div style={{ paddingTop: 26 }}>
        <div
          style={{
            font: `600 10px/1 ${mono(skin)}`,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: t.faint,
            marginBottom: 13,
          }}
        >
          {meta.topic ? `${meta.topic} · ` : ''}
          {monthYear(meta.generatedAt)}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: dw(skin),
            fontSize: 46,
            lineHeight: 1.04,
            letterSpacing: '-.01em',
            color: t.ink,
          }}
        >
          {meta.title}
        </h1>
        {meta.sub && (
          <p
            style={{
              margin: '14px 0 0',
              maxWidth: 620,
              fontSize: 15,
              lineHeight: 1.55,
              color: t.muted,
            }}
          >
            {meta.sub}
          </p>
        )}
        {sourceLine(meta, skin)}
      </div>
    </header>
  );
};

export const LegalMasthead: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  const rows: [string, React.ReactNode][] = [
    ['DATE:', fullDate(meta.generatedAt)],
    ['RE:', <span style={{ fontWeight: 600 }}>{meta.title}</span>],
  ];
  if (meta.sub) rows.push(['SUMMARY:', meta.sub]);
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 18,
          borderBottom: `2px solid var(--accent)`,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: skin.fonts.display,
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: '.02em',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            {skin.brand.name}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: t.faint,
              marginTop: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {/* The shared output tagline, never a professional identity: a reader picks this look
                for its style, and stamping "Attorneys at Law" under it claims the document was
                written by a law firm. */}
            {skin.brand.tagline}
          </div>
        </div>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}
        >
          {/* Neither privilege nor work-product attaches to a model-generated document, so the
              memo is marked the way every other template marks one. */}
          Confidential
        </span>
      </div>
      <div style={{ paddingTop: 26 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: t.faint,
            marginBottom: 14,
          }}
        >
          {meta.topic || 'Summary'}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '88px 1fr',
            gap: '7px 16px',
            fontFamily: skin.fonts.display,
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          {rows.map(([k, v], i) => (
            <div key={i} style={{ display: 'contents' }}>
              <span style={{ fontWeight: 600, color: t.faint }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};
