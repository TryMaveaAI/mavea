// The sources appendix: the full cited-source list, appended once near the end of a document
// whenever there are more sources than the masthead's inline provenance caption can show. Mirrors
// RankedList's ruled-row treatment (see lists.tsx) so it reads as part of the same document, not a
// bolted-on page. A source with a real, safe URL renders as a genuine `<a href>` — the raster
// pipeline's link layer (pipeline/linkLayer.ts) walks these same anchors to draw a clickable
// annotation over each one in the exported PDF; a source with no URL (or one that fails the
// http(s)-only gate below — a source URL is model/search output, not trusted input) renders as
// plain text, no link implied.
import { hostOf, safeHttpUrl } from '../../../lib/sourceHost';
import { SectionHeading } from './parts';
import type { SectionComponent } from '../types';

export const SourcesAppendix: SectionComponent<'sourcesAppendix'> = ({ data, skin }) => {
  const t = skin.tokens;
  const mono = skin.fonts.mono ?? skin.fonts.body;
  return (
    <div>
      <SectionHeading skin={skin} label={data.heading ?? 'Sources'} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.items.map((it, i) => {
          const last = i === data.items.length - 1;
          // A source URL is model/search output, not trusted input — gate it the same way every
          // other provenance surface does (LiveEvidence, working chips) before it ever becomes a
          // real href. A url that fails the gate renders exactly like no url at all.
          const safeUrl = it.url ? safeHttpUrl(it.url) : null;
          const row = {
            display: 'flex' as const,
            justifyContent: 'space-between' as const,
            alignItems: 'baseline' as const,
            gap: 16,
            padding: '13px 0',
            color: 'inherit',
            borderBottom: last ? 'none' : `1px solid ${t.rule}`,
          };
          // The decoration/color lives on the name span itself, not the flex row — a flex
          // container's own text-decoration doesn't paint across its flex-item children.
          const nameStyle = {
            fontFamily: skin.fonts.display,
            fontSize: 15,
            color: safeUrl ? 'var(--accent)' : t.ink,
            textDecoration: safeUrl ? 'underline' : 'none',
            textUnderlineOffset: '3px',
          };
          const metaStyle = {
            font: `500 10.5px/1.3 ${mono}`,
            color: t.faint,
            flex: 'none' as const,
          };
          return safeUrl ? (
            <a key={i} href={safeUrl} target="_blank" rel="noreferrer" style={row}>
              <span style={nameStyle}>{it.name}</span>
              <span style={metaStyle}>{hostOf(safeUrl)}</span>
            </a>
          ) : (
            <div key={i} style={row}>
              <span style={nameStyle}>{it.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
