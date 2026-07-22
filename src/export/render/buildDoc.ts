// Assemble a fully-paginated ExportDoc from the selected answers and a chosen skin. This is the
// orchestration the modal calls on every skin/accent/selection change: normalize → measure
// (DOM) → paginate. Pagination depends on measured heights, so this is async and browser-only.
import type { ConversationSpec } from '../../data/conversation';
import type { ContentsEntry, ExportDoc, ExportMeta, Section } from '../model/ExportDoc';
import { buildMeta, normalize, plain } from '../model/normalize';
import { measureDoc } from '../paginate/measure';
import { paginate } from '../paginate/paginate';
import type { PageFormat } from '../paginate/geometry';
import type { TemplateSkin } from '../skins/types';

/** Safety bound on the measure → split → re-measure loop below. Real content converges in 1–2
 *  passes (a split's first height is only an arithmetic estimate; one re-measure of the real DOM
 *  is normally enough to confirm every fragment now fits); this cap exists only to rule out a
 *  pathological oscillation, not because the loop is expected to run anywhere near it. */
const MAX_LAYOUT_PASSES = 4;

/**
 * Lay out already-normalized sections into a paginated document for a skin: measure → pack →
 * RE-MEASURE whatever fragments packing split off → repeat until a pack pass splits nothing (or
 * the pass cap is hit). Packing splits in two places — a section taller than a whole page, and a
 * split-to-fit head cut to fill a page's remaining space — and both produce fragments whose first
 * height is only an arithmetic estimate (uniform per item/char) that under-counts variable content
 * (wrapped cells, multi-line bodies, a code line that wraps). Re-measuring the real DOM and packing
 * again is the fit guarantee: the loop only converges on a pass whose every placement used a
 * measured height. If the pass cap is ever hit first, a final strict pass packs with splitting
 * disabled entirely, so no unverified estimate is ever placed — a still-over-tall section then
 * lands atomically, the documented last resort. We only pay for another measure pass when
 * something actually split.
 */
export async function layoutDoc(
  meta: ExportMeta,
  sections: Section[],
  skin: TemplateSkin,
  accent?: string,
  format: PageFormat = 'letter',
): Promise<ExportDoc> {
  let {
    sections: measured,
    contentH1,
    contentHRest,
  } = await measureDoc(meta, sections, skin, accent, format);

  let pages = paginate(measured, { contentH1, contentHRest });
  let converged = false;
  for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass += 1) {
    const flat = pages.flatMap((p) => p.sections);
    // Splitting only ever adds fragments, so an unchanged count means this pass split nothing —
    // every section it placed carried a real measured height.
    if (flat.length === measured.length) {
      converged = true;
      break;
    }
    const m = await measureDoc(meta, flat, skin, accent, format);
    measured = m.sections;
    contentH1 = m.contentH1;
    contentHRest = m.contentHRest;
    pages = paginate(measured, { contentH1, contentHRest });
  }
  if (!converged) pages = paginate(measured, { contentH1, contentHRest, fill: false });

  return { meta, sections: pages.flatMap((p) => p.sections), pages, format };
}

/** How many sources the masthead's own inline "READING · a · b · c · d +N more" caption shows
 *  before truncating (see mastheads.tsx / standard.tsx) — an export with more than this earns a
 *  full appendix so nothing cited is ever left unlisted. */
const SOURCES_APPENDIX_INLINE_LIMIT = 4;

/** Append a Sources appendix once, near the end, whenever the primary answer cites more sources
 *  than the masthead's own inline caption can show. A no-op otherwise — never an empty appendix. */
function withSourcesAppendix(sections: Section[], meta: ExportMeta): Section[] {
  if (meta.sources.length <= SOURCES_APPENDIX_INLINE_LIMIT) return sections;
  const appendix: Section = {
    kind: 'sourcesAppendix',
    id: 'sources-appendix',
    source: -1,
    lead: false,
    data: { heading: 'Sources', items: meta.sources },
  };
  return [...sections, appendix];
}

/** The page each source answer's lead section landed on (0-based `ExportPage.index`), keyed by
 *  its `source` index — the fact a table of contents needs to point at real pages. */
function leadPageMap(doc: ExportDoc, answerCount: number): number[] {
  const map = new Array<number>(answerCount).fill(0);
  for (const page of doc.pages) {
    for (const s of page.sections) {
      if (s.lead && s.source >= 0 && s.source < answerCount) map[s.source] = page.index;
    }
  }
  return map;
}

function samePageMap(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((page, i) => page === b[i]);
}

/** Insert a fresh Contents section as the document's first non-lead section (right after its
 *  opening lead, which always occupies index 0) — never mutates `sections`, so each convergence
 *  pass below starts clean rather than stacking a second table of contents onto the last one. */
function withContents(sections: Section[], specs: ConversationSpec[], pageOf: number[]): Section[] {
  const items: ContentsEntry[] = specs.map((spec, i) => ({
    title: plain(spec.title) || `Answer ${i + 1}`,
    page: (pageOf[i] ?? 0) + 1,
  }));
  const contents: Section = {
    kind: 'contents',
    id: 'contents',
    source: -1,
    lead: false,
    data: { heading: 'Contents', items },
  };
  const out = sections.slice();
  out.splice(1, 0, contents);
  return out;
}

/** Bound on the "learn page numbers → inject/refresh the contents section → re-paginate" loop:
 *  inserting the table of contents itself shifts every later page number, so the map it was built
 *  from can go stale the very pass it's used. Same shape and bound as `layoutDoc`'s own
 *  measure/split convergence loop above — real documents settle in 1–2 passes since each further
 *  pass only shifts numbers, never adds new content to lay out. */
const MAX_TOC_PASSES = 3;

export async function buildExportDoc(
  specs: ConversationSpec[],
  skin: TemplateSkin,
  generatedAt: number,
  accent?: string,
  num?: number,
  format: PageFormat = 'letter',
): Promise<ExportDoc> {
  const meta = buildMeta(specs, generatedAt, num);
  const base = withSourcesAppendix(normalize(specs), meta);

  // A single answer has nothing to enumerate — no contents page.
  if (specs.length <= 1) return layoutDoc(meta, base, skin, accent, format);

  let doc = await layoutDoc(meta, base, skin, accent, format);
  let pageOf = leadPageMap(doc, specs.length);
  for (let pass = 0; pass < MAX_TOC_PASSES; pass += 1) {
    const next = await layoutDoc(meta, withContents(base, specs, pageOf), skin, accent, format);
    const nextPageOf = leadPageMap(next, specs.length);
    doc = next;
    if (samePageMap(pageOf, nextPageOf)) break; // converged — the printed numbers are correct
    pageOf = nextPageOf;
  }
  return doc;
}
