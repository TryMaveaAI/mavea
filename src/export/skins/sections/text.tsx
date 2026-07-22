// Text archetypes: the finding callout, the inverted spotlight, and the universal prose
// fallback. All token-driven; accent/tint come through the inherited CSS variables.
import type { SectionComponent } from '../types';

export const FindingCallout: SectionComponent<'findingCallout'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  // A continuation fragment (the summary ran past one page) carries only the remaining text — the
  // eyebrow/title header stays on the first fragment, so it isn't repeated down the document.
  if (data.cont) {
    return (
      <div style={{ padding: '26px 30px', background: 'var(--tint)', borderRadius: t.cardRadius }}>
        {data.summary && (
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: t.muted }}>
            {data.summary}
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '128px 1fr',
        gap: 28,
        padding: '26px 30px',
        background: 'var(--tint)',
        borderRadius: t.cardRadius,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{ font: `600 10px/1 ${mono}`, letterSpacing: '.18em', color: 'var(--accent)' }}
        >
          FINDING {data.num ?? '01'}
        </span>
        {data.conf && (
          <span
            style={{
              font: `500 9.5px/1.3 ${mono}`,
              letterSpacing: '.06em',
              color: t.faint,
              textTransform: 'uppercase',
            }}
          >
            {data.conf}
          </span>
        )}
      </div>
      <div>
        <h2
          style={{
            margin: '0 0 8px',
            fontFamily: skin.fonts.display,
            fontWeight: skin.fonts.displayWeight ?? 400,
            fontSize: 27,
            lineHeight: 1.14,
            color: t.ink,
          }}
        >
          {data.title}
        </h2>
        {data.summary && (
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: t.muted }}>
            {data.summary}
          </p>
        )}
      </div>
    </div>
  );
};

export const SpotlightCard: SectionComponent<'spotlightCard'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  const bg = t.invertBg ?? t.ink;
  const ink = t.invertInk ?? '#F7F4EC';
  // A continuation fragment (the body ran past one page) shows only the remaining text, in the
  // same inverted card — the label/title header stays on the first fragment.
  if (data.cont) {
    return (
      <div style={{ background: bg, color: ink, borderRadius: t.cardRadius, padding: 28 }}>
        {data.body && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: ink, opacity: 0.78 }}>
            {data.body}
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        background: bg,
        color: ink,
        borderRadius: t.cardRadius,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        minHeight: 150,
      }}
    >
      {data.label && (
        <span
          style={{ font: `600 10px/1 ${mono}`, letterSpacing: '.16em', color: 'var(--accent)' }}
        >
          {data.label.toUpperCase()}
        </span>
      )}
      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            fontFamily: skin.fonts.display,
            fontWeight: skin.fonts.displayWeight ?? 400,
            fontSize: 30,
            lineHeight: 1.05,
          }}
        >
          {data.title}
        </div>
        {data.body && (
          <p
            style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: ink, opacity: 0.78 }}
          >
            {data.body}
          </p>
        )}
      </div>
    </div>
  );
};

export const Prose: SectionComponent<'prose'> = ({ data, skin }) => {
  const t = skin.tokens;
  return (
    <div>
      {data.heading && (
        <h3
          style={{
            margin: '0 0 10px',
            fontFamily: skin.fonts.display,
            fontWeight: skin.fonts.displayWeight ?? 400,
            fontSize: 22,
            lineHeight: 1.16,
            color: t.ink,
          }}
        >
          {data.heading}
        </h3>
      )}
      {data.body && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.62, color: t.muted }}>{data.body}</p>
      )}
    </div>
  );
};
