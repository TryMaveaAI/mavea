// The single rendering path shared by the preview, the offscreen measurement pass, the raster
// capture, and the vector print fallback. Because every consumer renders through here, what the
// user previews is exactly what the PDF contains.
import { Page } from '../skins/chrome/Page';
import { SHARED_SECTIONS } from '../skins/sections';
import '../export.css';
import type { ExportDoc, ExportMeta, ExportPage, Section } from '../model/ExportDoc';
import type { PageFormat } from '../paginate/geometry';
import type { TemplateSkin } from '../skins/types';

/** Render one section with the chosen skin: a skin override wins, else the shared default.
 *  The switch keeps `data` precisely typed to each archetype (no unsafe cast). */
export function RenderSection({
  section,
  skin,
  format,
}: {
  section: Section;
  skin: TemplateSkin;
  format: PageFormat;
}) {
  switch (section.kind) {
    case 'findingCallout': {
      const C = skin.sections.findingCallout ?? SHARED_SECTIONS.findingCallout;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'spotlightCard': {
      const C = skin.sections.spotlightCard ?? SHARED_SECTIONS.spotlightCard;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'prose': {
      const C = skin.sections.prose ?? SHARED_SECTIONS.prose;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'rankedList': {
      const C = skin.sections.rankedList ?? SHARED_SECTIONS.rankedList;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'checklist': {
      const C = skin.sections.checklist ?? SHARED_SECTIONS.checklist;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'numberedMilestones': {
      const C = skin.sections.numberedMilestones ?? SHARED_SECTIONS.numberedMilestones;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'verticalTimeline': {
      const C = skin.sections.verticalTimeline ?? SHARED_SECTIONS.verticalTimeline;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'figureGrid': {
      const C = skin.sections.figureGrid ?? SHARED_SECTIONS.figureGrid;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'figure': {
      const C = skin.sections.figure ?? SHARED_SECTIONS.figure;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'distributionBars': {
      const C = skin.sections.distributionBars ?? SHARED_SECTIONS.distributionBars;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'metricTiles': {
      const C = skin.sections.metricTiles ?? SHARED_SECTIONS.metricTiles;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'ratingMatrix': {
      const C = skin.sections.ratingMatrix ?? SHARED_SECTIONS.ratingMatrix;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'specTable': {
      const C = skin.sections.specTable ?? SHARED_SECTIONS.specTable;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'contents': {
      const C = skin.sections.contents ?? SHARED_SECTIONS.contents;
      return <C data={section.data} skin={skin} format={format} />;
    }
    case 'sourcesAppendix': {
      const C = skin.sections.sourcesAppendix ?? SHARED_SECTIONS.sourcesAppendix;
      return <C data={section.data} skin={skin} format={format} />;
    }
  }
}

/** One page: the right chrome (full masthead on page 0, running header otherwise), the placed
 *  sections, and the numbered footer. */
export function PageView({
  page,
  meta,
  skin,
  total,
  accent,
  format,
}: {
  page: ExportPage;
  meta: ExportMeta;
  skin: TemplateSkin;
  total: number;
  accent?: string;
  format: PageFormat;
}) {
  const Masthead = page.index === 0 ? skin.chrome.masthead : skin.chrome.runningHeader;
  const Footer = skin.chrome.footer;
  return (
    <Page
      skin={skin}
      accent={accent}
      format={format}
      header={<Masthead meta={meta} skin={skin} />}
      footer={<Footer meta={meta} skin={skin} page={page.index + 1} total={total} />}
    >
      {page.sections.map((s) => (
        <RenderSection key={s.id} section={s} skin={skin} format={format} />
      ))}
    </Page>
  );
}

/** Vertical gap between the stacked page sheets below. Exported because a consumer that scales the
 *  whole stack (the modal's preview) has to reproduce the flow's real height from page count. */
export const DOC_PAGE_GAP = 40;

/** The whole paginated document, one stacked sheet per page. The raster + print pipelines
 *  locate the individual `.ex-page` sheets via `querySelectorAll('.ex-page')` on the container. */
export function ExportDocView({
  doc,
  skin,
  accent,
}: {
  doc: ExportDoc;
  skin: TemplateSkin;
  accent?: string;
}) {
  return (
    <div
      className="ex-doc"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: DOC_PAGE_GAP,
        alignItems: 'center',
      }}
    >
      {doc.pages.map((page) => (
        <PageView
          key={page.index}
          page={page}
          meta={doc.meta}
          skin={skin}
          total={doc.pages.length}
          accent={accent}
          format={doc.format}
        />
      ))}
    </div>
  );
}
