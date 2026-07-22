// Greedy first-fit pagination with inline splitting. Pure: given sections with measured heights
// and the usable content height of page 1 vs. later pages, it packs them onto pages so none
// overflows — format-agnostic, since both caps already reflect whichever page size (Letter/A4)
// the caller measured against (see measure.ts). A section that exceeds the window in front of it
// (the remainder of the current page, or a whole page at the top of one) is cut by `split.ts`'s
// per-archetype splitters to fill that window exactly; a kind with no splitter (or one that
// can't usefully split further, e.g. a single giant row) is placed alone rather than dropped.
import { SECTION_GAP } from './geometry';
import { SPLIT_REGISTRY } from './split';
import type { ExportPage, Section } from '../model/ExportDoc';

export interface PaginateOpts {
  /** Usable content height on page 1 (under the full masthead). */
  contentH1: number;
  /** Usable content height on pages 2+ (under the slim running header). */
  contentHRest: number;
  /** Allow splitting at page boundaries (default true). `layoutDoc` disables it for a final
   *  strict pass when its measure→pack loop runs out of passes: with fill off, paginate performs
   *  NO splitting of any kind, so every placement carries a DOM-measured height — an unsplittable
   *  over-tall section lands atomically (the documented last resort) rather than as fragments
   *  with unverified estimated heights. */
  fill?: boolean;
}

/** The smallest bottom-of-page remainder worth filling with a split fragment. Below this, a cut
 *  buys a sliver of content plus a "(cont.)" heading on the next page — worse typography than the
 *  gap it removes. Heading chrome (~56px) plus a few lines of real content. */
export const MIN_SPLIT_WINDOW = 180;

/** Split any section taller than a page into page-fitting fragments; pass others through.
 *  (Retained for tests and offline tooling — `paginate` itself now splits inline at page
 *  boundaries, so a first fragment is sized to the page it actually lands on rather than to the
 *  smallest cap.) */
export function expandOversized(sections: Section[], capH: number): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    const splitter = SPLIT_REGISTRY[s.kind];
    const h = s.measuredH ?? 0;
    if (!splitter || h <= capH) {
      out.push(s);
      continue;
    }
    const parts = splitter(s, { first: capH, rest: capH });
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

/** Pack sections into pages. Page 1 uses `contentH1`; every page after uses `contentHRest`.
 *
 *  ONE split scheme, driven by the packer: whenever a section exceeds the window in front of it —
 *  the remainder of the current page mid-page, the whole page at the top of one — its splitter is
 *  asked to cut a head sized to that exact window, with continuations sized to full later pages.
 *  (An earlier draft pre-split oversized sections to the smallest cap and then split-to-fit cut
 *  those fragments again; the two schemes' boundaries never aligned, which seamed adjacent
 *  "(cont.)" fragments onto one page and wasted the taller pages' extra room.) */
export function paginate(sections: Section[], opts: PaginateOpts): ExportPage[] {
  const { contentH1, contentHRest, fill = true } = opts;
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

  // A queue rather than a plain loop: a split below re-queues the section's continuation
  // fragments, and those must be packed (and possibly split again) before anything that follows.
  const queue = sections.slice();
  while (queue.length) {
    const s = queue.shift()!;
    const h = s.measuredH ?? 0;
    // A new answer's lead heading starts a fresh page (unless we're already at the top).
    if (s.lead && cur.length) flush();
    const gap = cur.length ? SECTION_GAP : 0;
    const remaining = capFor() - used - gap;
    if (h <= remaining) {
      cur.push(s);
      used += gap + h;
      continue;
    }
    // Too tall for the window in front of it. Ask its splitter for a head cut to that window —
    // the splitter owns the typography judgment (orphan guards, sentence boundaries) and a
    // single-part result means it declined. Mid-page, a sliver below MIN_SPLIT_WINDOW is never
    // worth a "(cont.)"; at the top of a page the window is the whole page, so always ask.
    const midPage = cur.length > 0;
    const splitter = fill ? SPLIT_REGISTRY[s.kind] : undefined;
    if (splitter && (!midPage || remaining >= MIN_SPLIT_WINDOW)) {
      const parts = splitter(s, { first: remaining, rest: contentHRest, fromRemainder: midPage });
      if (parts.length > 1 && (parts[0].measuredH ?? 0) <= remaining) {
        cur.push(parts[0]);
        used += gap + (parts[0].measuredH ?? 0);
        queue.unshift(...parts.slice(1));
        continue;
      }
    }
    if (midPage) {
      // Retry at the top of a fresh page, where the window is the whole cap.
      flush();
      queue.unshift(s);
      continue;
    }
    // Taller than a whole page and unsplittable (or the splitter declined): the documented last
    // resort — place it atomically rather than drop or silently truncate it.
    cur.push(s);
    used += h;
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
