// The table of contents: injected by `buildDoc.ts` as the document's own second section (right
// after its opening lead) whenever more than one answer is bundled into one export. One shared,
// token-driven renderer serves all 10 skins — a title, a dotted leader line, and a real page
// number, ruled the same way every other list archetype is.
import { FitLine, SectionHeading } from './parts';
import type { SectionComponent } from '../types';

export const Contents: SectionComponent<'contents'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading ?? 'Contents'} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.items.map((it, i) => {
          const last = i === data.items.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '12px 0',
                borderBottom: last ? 'none' : `1px solid ${t.rule}`,
              }}
            >
              <FitLine
                style={{
                  flex: '0 1 auto',
                  minWidth: 0,
                  fontFamily: skin.fonts.display,
                  fontSize: 16,
                  color: t.ink,
                }}
              >
                {it.title}
              </FitLine>
              <span
                aria-hidden="true"
                style={{
                  flex: 1,
                  minWidth: 12,
                  alignSelf: 'flex-end',
                  marginBottom: 4,
                  borderBottom: `1px dotted ${t.rule}`,
                }}
              />
              <span
                style={{
                  flex: 'none',
                  fontFamily: mono,
                  fontSize: 12.5,
                  fontWeight: 500,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  color: t.muted,
                }}
              >
                {it.page}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
