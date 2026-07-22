// Build a markup tour with no model call: render the document's most load-bearing claims offscreen
// (pdf.js) and mark each cited passage, so "Share as reel" always has something rich even if the
// reader didn't manually annotate. Ordering reuses the Briefing's salience (keystone → tensions →
// troubled verdicts). PDF-only: renderPageWithHighlight returns null for non-PDF sources, which are
// simply skipped (the claim still grounded; it just gets no reel beat).
import { isPdf, type Attachment } from '../../attachments';
import { renderPageWithHighlight } from '../extractPdf';
import { buildBriefing } from '../briefing';
import type { Placed } from '../layout';
import type { Claim, ClaimRole, PrismSpec } from '../types';
import type { Verdict } from '../veracity';
import { accentForClaim, claimReelCaption, inkForKind } from './pen';
import type { AnnotationStep } from './steps';

const EMPTY_VERDICTS: ReadonlyMap<string, Verdict> = new Map();

export interface AutoTourOpts {
  /** The laid-out claims (with positions) — lets the briefing path order by salience. */
  placed?: readonly Placed[];
  verdicts?: ReadonlyMap<string, Verdict>;
  /** How many pages to render (kept small — each is an offscreen pdf.js pass). */
  max?: number;
}

/** Render width — smaller on low-memory / low-core machines so a weak device still finishes. */
function pageWidth(): number {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const mem = (nav as { deviceMemory?: number } | undefined)?.deviceMemory ?? 8;
  const cores = nav?.hardwareConcurrency ?? 8;
  return mem <= 4 || cores <= 4 ? 900 : 1100;
}

const ROLE_RANK: Record<ClaimRole, number> = { 'load-bearing': 0, supporting: 1, context: 2 };

/** Order claims by briefing salience when laid out; otherwise load-bearing first, then page order. */
function orderClaims(
  spec: PrismSpec,
  placed: readonly Placed[] | undefined,
  verdicts: ReadonlyMap<string, Verdict>,
): Claim[] {
  if (placed && placed.length) {
    const byId = new Map(spec.claims.map((c) => [c.id, c]));
    const beats = buildBriefing(placed, spec.threads, verdicts);
    const seen = new Set<string>();
    const ordered: Claim[] = [];
    for (const beat of beats) {
      for (const id of beat.claimIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const c = byId.get(id);
        if (c) ordered.push(c);
      }
    }
    // Any claim the briefing didn't name still gets a turn if there's room.
    for (const c of spec.claims) if (!seen.has(c.id)) ordered.push(c);
    return ordered;
  }
  return [...spec.claims].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.page - b.page);
}

/**
 * Render up to `max` of the document's key claims to annotation steps (page raster + cited rects +
 * a verbatim explanation). No model call — only pdf.js page renders. Sequential on purpose: the
 * pdf.js render cache holds one open document, so concurrent renders would thrash it.
 */
export async function autoAnnotationSteps(
  spec: PrismSpec,
  pdfs: readonly Attachment[],
  opts: AutoTourOpts = {},
): Promise<AnnotationStep[]> {
  const max = opts.max ?? 6;
  const verdicts = opts.verdicts ?? EMPTY_VERDICTS;
  const ordered = orderClaims(spec, opts.placed, verdicts).slice(0, max);
  const width = pageWidth();
  const steps: AnnotationStep[] = [];

  for (const c of ordered) {
    const pdf = pdfs[c.source];
    if (!pdf) continue;
    const accent = accentForClaim(c);
    const base = {
      isFigure: c.kind === 'diagram',
      seed: `${c.source}:${c.page}:${c.quote}`,
      color: inkForKind(c.kind),
      title: c.title,
      // A guided-tour line that frames why the passage matters — not a raw quote dump (the cited
      // text itself is already highlighted on the rendered page beside it).
      explanation: claimReelCaption(c),
      // Same claim-derived judgment ink the live pen draws (a load-bearing star, a forecast's
      // "?"), so the tour and the exported reel mark exactly like the reader's own view.
      ...(accent ? { accent } : {}),
    };

    if (isPdf(pdf)) {
      const res = await renderPageWithHighlight(
        pdf,
        c.page,
        c.quote,
        width,
        c.kind === 'diagram',
      ).catch(() => null);
      if (res) {
        try {
          steps.push({
            ...base,
            pageImage: res.canvas.toDataURL('image/jpeg', 0.8),
            imgW: res.canvas.width,
            imgH: res.canvas.height,
            rects: res.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
            figure: res.figure
              ? { x: res.figure.x, y: res.figure.y, w: res.figure.w, h: res.figure.h }
              : undefined,
          });
          continue;
        } catch {
          // tainted / unrasterable canvas — fall through to a clean caption beat
        }
      }
    }

    // Non-PDF (office/text/image deck) or a PDF page that wouldn't render: a clean caption beat. The
    // documentMarkup finish shows the title + framing on a card when there's no page raster, so the
    // reel still covers the document instead of coming up empty.
    steps.push({ ...base, pageImage: '', imgW: 0, imgH: 0, rects: [] });
  }
  return steps;
}
