// Greedy first-fit pagination. Pure: given sections with measured heights and the usable
// content height of page 1 vs. later pages, it packs them onto pages so none overflows — format-
// agnostic, since both caps already reflect whichever page size (Letter/A4) the caller measured
// against (see measure.ts). A section taller than a whole page is split across pages by `split.ts`'s
// per-archetype
// splitters before packing; a kind with no splitter (or one that can't usefully split further,
// e.g. a single giant row) is placed alone rather than dropped.
import { SECTION_GAP } from './geometry';
import { SPLIT_REGISTRY } from './split';
import type { ExportPage, Section } from '../model/ExportDoc';

export interface PaginateOpts {
  /** Usable content height on page 1 (under the full masthead). */
  contentH1: number;
  /** Usable content height on pages 2+ (under the slim running header). */
  contentHRest: number;
}

/** Split any section taller than a page into page-fitting fragments; pass others through. */
export function expandOversized(sections: Section[], capH: number): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    const splitter = SPLIT_REGISTRY[s.kind];
    const h = s.measuredH ?? 0;
    if (!splitter || h <= capH) {
      out.push(s);
      continue;
    }
    const parts = splitter(s, capH);
    if (parts.length <= 1) {
      out.push(s);
      continue;
    }
    out.push(...parts);
  }
  return out;
}

/** One page whose summed content still exceeds its cap after splitting/expansion — the fixed page
 *  sheet clips whatever `fill - cap` pixels don't fit. Should be vanishingly rare once a kind has
 *  a real splitter; this is the safety net for the archetypes that don't (or can't). */
export interface PageOverflow {
  index: number;
  fill: number;
  cap: number;
}

/** Every page, if any, that still overflows its cap. Called by `paginate` itself as a genuine
 *  safety net (dev-only console warning) and directly assertable in tests as a hard pass/fail
 *  check — the proof that a document never silently clips. */
export function auditPages(pages: ExportPage[], opts: PaginateOpts): PageOverflow[] {
  const overflows: PageOverflow[] = [];
  for (const p of pages) {
    const cap = p.index === 0 ? opts.contentH1 : opts.contentHRest;
    const fill = p.sections.reduce(
      (sum, s, i) => sum + (i ? SECTION_GAP : 0) + (s.measuredH ?? 0),
      0,
    );
    if (fill > cap + 1) overflows.push({ index: p.index, fill, cap });
  }
  return overflows;
}

/** Pack sections into pages. Page 1 uses `contentH1`; every page after uses `contentHRest`. */
export function paginate(sections: Section[], opts: PaginateOpts): ExportPage[] {
  const { contentH1, contentHRest } = opts;
  // Split to the smaller cap so a fragment fits whichever page it lands on (page 1 is shortest).
  const items = expandOversized(sections, Math.min(contentH1, contentHRest));
  const pages: ExportPage[] = [];
  let cur: Section[] = [];
  let used = 0;

  const capFor = () => (pages.length === 0 ? contentH1 : contentHRest);
  const flush = () => {
    if (cur.length) {
      pages.push({ index: pages.length, sections: cur });
      cur = [];
      used = 0;
    }
  };

  for (const s of items) {
    const h = s.measuredH ?? 0;
    // A new answer's lead heading starts a fresh page (unless we're already at the top).
    if (s.lead && cur.length) flush();
    const gap = cur.length ? SECTION_GAP : 0;
    const cap = capFor();
    if (cur.length > 0 && used + gap + h > cap) flush();
    cur.push(s);
    used += (cur.length > 1 ? SECTION_GAP : 0) + h;
  }
  flush();

  if (!pages.length) pages.push({ index: 0, sections: [] });

  // Balance the final spread. Greedy packing can strand one small section on the last page after
  // a packed one — a near-empty closing page reads as a typesetting mistake. Move whole trailing
  // sections back from the previous page until the last page carries real weight (or nothing more
  // fits). Order is preserved and no section is ever re-split.
  const fillOf = (secs: Section[]): number =>
    secs.reduce((sum, s, i) => sum + (i ? SECTION_GAP : 0) + (s.measuredH ?? 0), 0);
  const baseId = (id: string): string => id.split('~')[0];
  while (pages.length >= 2) {
    const last = pages[pages.length - 1];
    const prev = pages[pages.length - 2];
    if (fillOf(last.sections) > contentHRest * 0.35) break;
    // A page opened by a chapter lead keeps its fresh-page start — a light part-opener page is
    // deliberate typography, not a widow.
    if (last.sections[0]?.lead) break;
    const cand = prev.sections[prev.sections.length - 1];
    if (!cand || prev.sections.length <= 1) break;
    // Never reunite fragments of one split section — stacking "X (cont.)" twice reads worse than a
    // light page.
    if (last.sections[0] && baseId(cand.id) === baseId(last.sections[0].id)) break;
    if (fillOf(last.sections) + SECTION_GAP + (cand.measuredH ?? 0) > contentHRest) break;
    prev.sections.pop();
    last.sections.unshift(cand);
  }

  // Dev guard: if a page's summed content still exceeds its cap, the fixed page sheet will clip
  // it — surface that here so it's caught in development rather than discovered in a shipped PDF.
  if (import.meta.env?.DEV) {
    for (const o of auditPages(pages, opts)) {
      console.warn(
        `[export] page ${o.index + 1} content ${Math.round(o.fill)}px exceeds cap ${Math.round(o.cap)}px — may clip`,
      );
    }
  }
  return pages;
}
