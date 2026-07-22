// The shared page chrome: a clean masthead (wordmark · tagline · domain · title · dek),
// a slim running header for pages 2+, and a footer with the provenance line + "NN / TT".
// Skins with a structurally distinct masthead (Swiss's numeral, Medical's record grid,
// Legal's memo header…) ship their own; most reuse the running header + footer as-is.
import type { ExportMeta } from '../../model/ExportDoc';
import type { FooterComponent, MastheadComponent, TemplateSkin } from '../types';
import { issueNumber, monthYear } from './dates';

function mono(skin: TemplateSkin): string {
  return skin.fonts.mono ?? skin.fonts.body;
}

/** "Reading · a.pdf · b.pdf" — the honest provenance caption (omitted when there are no sources). */
function Provenance({ meta, skin }: { meta: ExportMeta; skin: TemplateSkin }) {
  if (!meta.sources.length) return null;
  const shown = meta.sources
    .slice(0, 4)
    .map((s) => s.name)
    .join('  ·  ');
  const extra = meta.sources.length > 4 ? `  +${meta.sources.length - 4} more` : '';
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

export const StandardMasthead: MastheadComponent = ({ meta, skin }) => {
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
              textAlign: 'right',
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
        <h1
          style={{
            margin: 0,
            fontFamily: skin.fonts.display,
            fontWeight: skin.fonts.displayWeight ?? 400,
            fontSize: 54,
            lineHeight: 1.02,
            letterSpacing: '-.01em',
            color: t.ink,
          }}
        >
          {meta.title}
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
        <Provenance meta={meta} skin={skin} />
      </div>
    </header>
  );
};

export const StandardRunningHeader: MastheadComponent = ({ meta, skin }) => {
  const t = skin.tokens;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingBottom: 12,
        marginBottom: 8,
        borderBottom: `1px solid ${t.rule}`,
        gap: 16,
      }}
    >
      <span
        style={{
          font: `600 11px/1 ${mono(skin)}`,
          letterSpacing: '.28em',
          color: t.ink,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {skin.brand.name}
      </span>
      {/* Falls back to the full title when there's no topic — real, unbounded text, so this one
          truncates (rather than the guaranteed-nowrap wordmark next to it giving up its space). */}
      <span
        style={{
          font: `500 10px/1 ${mono(skin)}`,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {meta.topic || meta.title}
      </span>
    </div>
  );
};

export const StandardFooter: FooterComponent = ({ skin, page, total }) => {
  const t = skin.tokens;
  return (
    <footer
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: `1px solid ${t.rule}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          font: `500 9.5px/1 ${mono(skin)}`,
          letterSpacing: '.1em',
          color: t.faint,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {skin.brand.name} · {skin.brand.tagline}
      </span>
      <span
        style={{
          font: `500 9.5px/1 ${mono(skin)}`,
          letterSpacing: '.1em',
          color: t.faint,
          whiteSpace: 'nowrap',
        }}
      >
        {String(page).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </footer>
  );
};
