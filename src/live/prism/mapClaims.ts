// mapClaims.ts — the model side of Prism, kept apart from the pure grounding/chunking helpers.
//
// Two jobs, split so neither blows the token budget on a dense document:
//   1. EXTRACT — pull the real per-page text out of the PDF client-side (extractPdf.ts / pdf.js).
//      This is ground truth for the grounding gate. We never ask the model to echo the document back
//      — a 12-page paper's text dwarfs any output budget and truncates the JSON to nothing (the bug
//      that left the Dynamo paper "no claims could be mapped").
//   2. MAP — the model reads the PDF for MEANING and returns ONLY claims (quote, page, kind, title,
//      region) — small output that fits comfortably. Every candidate then runs through the strict
//      grounding gate (selectGroundedClaims) against the extracted text before a card exists, so a
//      fabricated or mis-cited quote is dropped. Regions and contradiction threads come only from
//      survivors — nothing on the map is invented.
//
// One extraction pass, plus a compact grounded-claim relation pass: matches the "explode" gesture
// while keeping the contradiction map aligned with what Ask It can later find from the same evidence.
import type { Attachment } from '../attachments';
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers';
import { ensureAttachmentData, isOffice, isPdf, isText } from '../attachments';
import { groundClaimsOffMain } from './groundOffMain';
import { skimPagesToPrompt, parseSkimPages, selectedPagesToPrompt } from './mapping';
import { extractPdfPages } from './extractPdf';
import type { OfficeImage } from './officeDoc';
import { extractOfficeOffMain, extractTextOffMain } from './extractClientDocument';
import type {
  Claim,
  ClaimBox,
  ClaimKind,
  ClaimRole,
  PrismSpec,
  Thread,
  ThreadRelation,
  CandidateClaim,
} from './types';

const KINDS: ClaimKind[] = [
  'forecast',
  'stat',
  'finding',
  'risk',
  'definition',
  'method',
  'diagram',
];

function asKind(s: unknown): ClaimKind {
  const k = String(s ?? '').toLowerCase();
  return (KINDS as string[]).includes(k) ? (k as ClaimKind) : 'finding';
}

const ROLES: ClaimRole[] = ['load-bearing', 'supporting', 'context'];

/** Coerce the model's proposed role to a known {@link ClaimRole}. Unknown/missing → 'supporting'
 *  (a neutral middle), so a provider that omits the field degrades to a flat-but-valid hierarchy. */
function asRole(s: unknown): ClaimRole {
  const r = String(s ?? '')
    .toLowerCase()
    .trim();
  return (ROLES as string[]).includes(r) ? (r as ClaimRole) : 'supporting';
}

/** The structured ask. The model returns ONLY claims (we extract page text ourselves), and the hard
 *  rule is that every quote must be copied VERBATIM from its page — that's what makes grounding pass. */
/** How many slide images we send to the vision model for an image-only deck — bounds the request's
 *  size/cost. A deck longer than this is read up to this many slides (logged-honest via the count). */
const MAX_VISION_SLIDES = 30;

// Skim-then-deep, for a long text-rich document (PDF/Office/text). Deep-reading every page of a
// 400-page report in one prompt costs a fortune (and blows the context window); reading it in ~100
// tiny windows costs even more. Instead: once a document is longer than DEEP_PAGE_CAP pages, a cheap
// FIRST call reads a thin slice of every page and points at the ≤DEEP_PAGE_CAP densest pages, then
// the normal deep map call reads only those. Two bounded calls, whatever the length — so a huge PDF
// stays cheap while still being chosen from across the whole document.
const DEEP_PAGE_CAP = 40; // most pages we ever deep-read (and the most the skim may choose)
const DEEP_PER_PAGE = 2000; // chars of a chosen page's text handed to the deep map call
const SKIM_PER_PAGE = 220; // chars per page in the thin whole-document outline
const SKIM_TOKENS = 700; // the skim only returns a short JSON list of page numbers

const SKIM_PROMPT = `You are given a THIN slice of every page of a long document. Pick the pages that carry the most important, quotable content — the thesis, key findings, definitions, decisive data, and the conclusions — and skip filler (title/cover pages, tables of contents, reference lists, boilerplate). Return STRICT JSON only, no prose: {"pages":[<1-based page numbers>]}. Choose at most ${DEEP_PAGE_CAP} pages, in reading order.`;

/** The cheap first pass of skim-then-deep: read a thin outline of the whole document and return the
 *  page numbers worth deep-reading. Never throws — on any failure it falls back to an even spread
 *  across the document so the deep pass still gets a representative, bounded set of pages. */
async function skimSelectPages(
  pages: readonly string[],
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<number[]> {
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        system: 'You pick the most important pages of a document and return strict JSON only.',
        history: [],
        user: `${SKIM_PROMPT}\n\n${skimPagesToPrompt(pages, SKIM_PER_PAGE)}`,
        attachments: [],
        maxTokens: SKIM_TOKENS,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    return parseSkimPages(out.raw, pages.length, DEEP_PAGE_CAP);
  } catch {
    return parseSkimPages('{}', pages.length, DEEP_PAGE_CAP);
  }
}

const MAP_PROMPT = `You are mapping a document for a spatial "explode" view — a map of its key claims.

Return ONLY a JSON object (no prose, no markdown fences) of this exact shape:
{
  "regions": ["Section A", "Section B", ...],
  "claims": [
    {
      "quote": "a phrase copied VERBATIM from the document (about 6-160 characters, appearing word-for-word in the text)",
      "page": 3,
      "kind": "forecast|stat|finding|risk|definition|method|diagram",
      "title": "a 3-7 word headline for the claim",
      "ask": "a short follow-up question about this claim",
      "role": "load-bearing|supporting|context",
      "region": "which of regions[] this claim belongs to",
      "contradictsPage": 27
    }
  ]
}

Rules:
- Each claim "quote" MUST be copied character-for-character, and "page" MUST be the page it appears on.
  When a "DOCUMENT TEXT" section is given below, copy every quote from THERE — not from the rendered
  look of the page — exactly as it appears, including how "$", digits, commas, units, and the spacing
  between them are written. That text is what your quote is verified against; a number retyped from the
  visual layout won't match. Quotes are checked verbatim — anything not found is dropped, so no
  paraphrasing, no "[...]", no rounding ("$7,438" not "$7.4 billion"). Quote a single CONTIGUOUS run of
  the text: a table row reads label-then-number (e.g. "Total net revenue $ 10,253"), so quote it that
  way — never stitch words from across the table.
- "regions" are the document's own sections/themes (3-6 of them). Every claim's "region" must be one.
- "role" marks how central the claim is to the document's case: "load-bearing" for the thesis, the
  headline number, or the assertion the whole conclusion rests on; "supporting" for real evidence and
  findings; "context" for definitions, background, or method detail. Mark only a FEW (about 2-4) as
  "load-bearing" — these are what the reader sees first, so reserve it for the claims that truly carry
  the argument.
- Include "contradictsPage" ONLY when this claim genuinely conflicts with a claim on that other page.
- For a DATA TABLE (a financial statement, a results table), do NOT just emit one "diagram" claim of
  the table's title — the title alone ("Selected Corporate Data Table") is not analysis. Pull the KEY
  FIGURES out of the table as separate "stat" claims: the headline totals, each major line item or
  segment, and any growth rate or margin. Quote each figure's row from the DOCUMENT TEXT (e.g. "Total
  net revenue $ 10,253", "Data Center Segment $ 5,775"). The specific numbers ARE the point.
- Reserve kind "diagram" for a genuine CHART, FIGURE, or DIAGRAM (something visual — not a number
  table), using its caption as the verbatim quote (e.g. "Figure 2: Partitioning and replication of keys").
- Cover the WHOLE document — spread claims across ALL of its pages and sections, not just the first page
  or the opening summary. Later sections, financial statements, and data tables matter as much as the
  intro; pull the key figures from each major section, citing the page each is really on.
- Aim for 12-24 of the document's most important claims — and MORE for a long or data-dense document (a
  financial report with multiple statements, a deck, a long paper): take the key figures from each major
  section, as "stat" claims, and spread them across the regions.`;

/** Prompt for an IMAGE-ONLY deck (slides exported as pictures — no selectable text). The model reads
 *  the attached slide images and transcribes the visible text into the same claim shape. The "quote"
 *  must be text the model can actually SEE on the slide, and "page" is the 1-based slide number. */
const VISION_MAP_PROMPT = `${MAP_PROMPT}

This document is a slide deck exported as IMAGES — each attached image is one slide, in order. Read
the text visible ON each slide. Every claim "quote" must be a phrase you can actually see on a slide,
transcribed exactly, and "page" must be that slide's number (the 1-based order of the attached
images). Skip purely decorative slides. Treat each slide as its own "region" when no clearer section
emerges from the content.`;

/** Render extracted page text as a prompt body (for Office docs, whose binary the model can't read).
 *  Each page is fenced with its 1-indexed marker so the model cites the right "page". Truncated per
 *  page so a long deck/doc stays within the token budget. `pageLabels` (a spreadsheet's real sheet
 *  names) annotates each marker so the model can cite the sheet by name, not just a bare number. */
function pagesToPrompt(pages: readonly string[], pageLabels?: readonly string[]): string {
  // Give each page enough room to expose its figures — a financial statement runs well past 1.2k chars,
  // and (for a text-rich PDF) this text is the model's ONLY view of the page — while keeping the whole
  // prompt bounded for a long document (more pages → a smaller per-page slice, floored so it stays useful).
  const perPage = Math.max(1400, Math.min(2600, Math.round(34000 / Math.max(1, pages.length))));
  const body = pages
    .map((t, i) => {
      const label = pageLabels?.[i];
      const marker = label ? `[page ${i + 1} — "${label}"]` : `[page ${i + 1}]`;
      return `${marker}\n${t.slice(0, perPage)}`;
    })
    .join('\n\n');
  return `DOCUMENT TEXT (cite "page" by these markers):\n${body}`;
}

/** Pull the first balanced top-level JSON object out of a possibly-noisy model response. */
function extractJsonObject(raw: string | object): unknown {
  if (typeof raw === 'object') return raw;
  const text = String(raw);
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Parse + sanity-check a model-supplied bounding box (normalized 0–1000). Returns null unless it's a
 *  finite, non-empty box inside the slide — so a malformed or off-slide box can't draw a wrong mark.
 *  Coordinates are clamped to the slide and the box is shrunk to fit if it spills past the edge. */
function parseBox(v: unknown): ClaimBox | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  const w = Number(r.w);
  const h = Number(r.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  const cx = Math.max(0, Math.min(1000, x));
  const cy = Math.max(0, Math.min(1000, y));
  const cw = Math.max(1, Math.min(1000 - cx, w));
  const ch = Math.max(1, Math.min(1000 - cy, h));
  // A box that covers essentially the whole slide is no better than no box — drop it so the panel
  // doesn't draw a frame around the entire image.
  if (cw >= 985 && ch >= 985) return null;
  return { x: cx, y: cy, w: cw, h: ch };
}

/** Parse the model's JSON into candidate claims, defensively (any field may be missing). The model
 *  returns only claims now — the page text comes from client-side extraction, not the model. */
function parseResponse(raw: string | object): CandidateClaim[] {
  const obj = extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') return [];
  const o = obj as Record<string, unknown>;
  const rawClaims = Array.isArray(o.claims) ? o.claims : [];
  const candidates: CandidateClaim[] = [];
  for (const c of rawClaims) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const quote = asString(r.quote);
    const page = Number(r.page);
    if (!quote || !Number.isInteger(page)) continue;
    candidates.push({
      quote,
      page,
      kind: asString(r.kind) || undefined,
      title: asString(r.title) || undefined,
      ask: asString(r.ask) || undefined,
      role: asString(r.role) || undefined,
      region: asString(r.region) || undefined,
      ...(Number.isInteger(Number(r.contradictsPage))
        ? { contradictsPage: Number(r.contradictsPage) }
        : {}),
      ...(parseBox(r.box) ? { box: parseBox(r.box)! } : {}),
    });
  }
  return candidates;
}

/** A short, human label for a document, from its filename — drops the extension, trims length. */
function docLabel(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '').trim();
  return base.length > 28 ? base.slice(0, 27).trimEnd() + '…' : base || 'Document';
}

/** Build the ordered, de-duplicated region list from grounded claims (first-seen order). */
function regionsOf(claims: readonly Claim[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of claims) {
    if (!seen.has(c.region)) {
      seen.add(c.region);
      out.push(c.region);
    }
  }
  return out;
}

/**
 * Derive contradiction threads ONLY between two grounded claims. The model's `contradictsPage` is a
 * hint; we draw a thread only when we can find a real grounded claim on that page, so a thread always
 * connects two passages that actually exist. Pairs are de-duplicated; "in-tension" is reserved for
 * future softer relations (the model marks hard contradictions here).
 */
function deriveThreads(claims: readonly (Claim & { contradictsPage?: number })[]): Thread[] {
  // The `contradictsPage` hint references a page within the SAME document, so key the lookup by
  // (source, page) — otherwise a multi-document world would wrongly link page 2 of doc A to page 2 of B.
  const byPage = new Map<string, Claim[]>();
  const pageKey = (source: number, page: number): string => `${source}:${page}`;
  for (const c of claims) {
    const k = pageKey(c.source, c.page);
    const arr = byPage.get(k) ?? [];
    arr.push(c);
    byPage.set(k, arr);
  }
  const threads: Thread[] = [];
  const seenPair = new Set<string>();
  for (const c of claims) {
    const target = c.contradictsPage;
    if (!target) continue;
    const partners = byPage.get(pageKey(c.source, target));
    if (!partners?.length) continue;
    const partner = partners.find((p) => p.id !== c.id);
    if (!partner) continue;
    const key = [c.id, partner.id].sort().join('|');
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    threads.push({ a: c.id, b: partner.id, relation: 'contradicts' });
  }
  return threads;
}

function relationOf(raw: unknown): ThreadRelation {
  const rel = String(raw);
  return rel === 'agrees' ? 'agrees' : rel === 'in-tension' ? 'in-tension' : 'contradicts';
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export interface MapClaimsResult {
  spec: PrismSpec | null;
  /** How many claims the model proposed (before grounding) — for honest "dropped N" telemetry. */
  proposed: number;
  /** Set when the model couldn't be reached or returned nothing usable. */
  error?: string;
  /** The per-document page text the claims were grounded against (`corpus[doc][page-1]`), retained so
   *  "Ask It" can verify an answer's spans verbatim against the real pages without re-extracting. */
  corpus?: string[][];
}

/** A single document's grounded result, before merge: its claims (each carrying a same-doc
 *  contradiction hint) and the page text we grounded them against (kept for the cross-doc pass). */
interface DocResult {
  fileName: string;
  pages: string[];
  claims: (Claim & { contradictsPage?: number })[];
  proposed: number;
  error?: string;
  /** For an image-only deck: the slide images, so the source panel can show the real slide. */
  slideImages?: OfficeImage[];
  /** For a spreadsheet: each page's real sheet name, index-aligned with `pages`. */
  pageLabels?: string[];
}

/** Map ONE document: extract its text, ask the model for claims, ground + page-correct them. */
async function mapOneDocument(
  pdf: Attachment,
  cfg: ModelConfig,
  source: number,
  signal?: AbortSignal,
  pagesOverride?: readonly string[],
): Promise<DocResult> {
  // A PDF is read by the model NATIVELY (sent as an attachment) while we extract its text in parallel
  // for grounding. An Office doc's or text file's content goes INTO the prompt — no attachment. All
  // paths produce the same pages[] for grounding.
  const office = isOffice(pdf);
  const text = !office && !isPdf(pdf) && isText(pdf);
  // Office docs carry a diagnostic reason on failure so the UI can say WHY it couldn't read them.
  // An image-only deck (slides exported as pictures) carries its slide images for the vision path.
  let pages: string[] | null;
  let officeReason: string | undefined;
  let officeImages: OfficeImage[] | undefined;
  let slideImages: Attachment[] | undefined;
  let pageLabels: string[] | undefined;
  if (pagesOverride) {
    pages = pagesOverride as string[];
  } else if (office) {
    const res = await extractOfficeOffMain(pdf);
    pages = res.pages;
    officeReason = res.reason;
    pageLabels = res.pageLabels;
    if ((!res.pages || res.pages.length === 0) && res.images && res.images.length > 0) {
      // No text, but the deck is built from slide images — read them with the vision model, and keep
      // the images so the source panel can show the real slide a claim came from. Cap how many slides
      // we send so a 100-slide deck doesn't blow the vision request's size/cost; the source panel
      // still maps to the slides we sent (page is 1-based within them).
      officeImages = res.images.slice(0, MAX_VISION_SLIDES);
      slideImages = officeImages.map((img, i) => ({
        name: `${pdf.name} — slide ${i + 1}`,
        mime: img.mime,
        data: img.data,
        size: 0,
      }));
    }
  } else if (text) {
    // Plain-text / data file (CSV, TXT, Markdown, JSON, code): the bytes are the text, smart-paged.
    pages = await extractTextOffMain(pdf);
  } else {
    pages = (await extractPdfPages(pdf)) ?? null;
  }

  // The vision path: an image-only deck. The model OCRs the slides; we build the grounding corpus
  // from what it transcribes (the slides have no underlying text to verify against).
  const visionDeck = !pages && !!slideImages;
  // Office + text files feed their extracted text into the prompt with no attachment. A native PDF
  // whose text we extracted well does the SAME: we send only the (reading-ordered) page text, NOT the
  // rendered image. Given both, the model quotes the clean visual numbers it sees in the image — which
  // don't match the extracted text — so they fail the verbatim gate and drop (a dense financial PDF
  // collapsed to 2 grounded claims). Text-only forces it to quote the exact text grounding verifies, so
  // the figures survive. A scan (little/no real text) keeps the image — vision is the only way to read it.
  const textLen = pages ? pages.reduce((n, p) => n + p.length, 0) : 0;
  const pdfTextRich = isPdf(pdf) && !!pages && textLen > Math.max(400, pages.length * 60);
  const inPrompt = office || text || pdfTextRich;
  const adapter = getAdapter(cfg.provider);
  if (!visionDeck && (!pages || pages.length === 0)) {
    // Name what actually failed. A PDF reaches here only when pdf.js could not OPEN the file (it's
    // corrupt, password-protected, or not really a PDF) or it carries no pages — a SCAN opens fine,
    // with blank pages, and takes the vision path below. The old "it may be a scan with no
    // selectable text" line was therefore wrong in every case it could fire, and sent people off to
    // re-scan a document whose real problem was that it wasn't readable at all.
    return {
      fileName: pdf.name,
      pages: [],
      claims: [],
      proposed: 0,
      error:
        office || text
          ? `Couldn't read this document's text${officeReason ? ` — ${officeReason}` : ''}.`
          : "Couldn't open this PDF — it may be corrupt, password-protected, or not a PDF.",
    };
  }
  // The genuine scan: the PDF opened, but there is no text to extract — so the only way to read it is
  // a model that takes the document itself. On a provider that can't (parts.ts degrades a PDF to a
  // "can't read" note), sending it anyway produced claims grounded in nothing and a baffling "no
  // claims were grounded in the page text". Say what's wrong and what fixes it, before spending a call.
  if (isPdf(pdf) && !visionDeck && textLen === 0 && !adapter.capabilities.vision) {
    return {
      fileName: pdf.name,
      pages: pages ?? [],
      claims: [],
      proposed: 0,
      error:
        'This PDF has no selectable text — it looks like a scan. Connect a model that reads documents (Anthropic or Gemini) to read it.',
    };
  }

  // Skim-then-deep for a long text-rich document: a cheap outline pass picks the densest pages, and
  // the deep map below reads ONLY those — so a 400-page PDF is ~2 bounded calls, not one giant prompt.
  // A short document (≤ DEEP_PAGE_CAP pages) goes straight to the deep map over all of its pages.
  const bigTextDoc = inPrompt && !!pages && pages.length > DEEP_PAGE_CAP;
  const deepPages = bigTextDoc ? await skimSelectPages(pages!, cfg, signal) : null;
  if (signal?.aborted)
    return {
      fileName: pdf.name,
      pages: pages ?? [],
      claims: [],
      proposed: 0,
      ...(pageLabels ? { pageLabels } : {}),
    };

  // Scale the output budget to the pages actually read (bounded by the deep cap for a long doc), not
  // the full length: ~240 tokens/page over a 4096 floor, capped so the request stays bounded.
  const docPages = visionDeck
    ? (slideImages?.length ?? 1)
    : Math.min(pages?.length ?? 1, DEEP_PAGE_CAP);
  const mapTokens = Math.min(8192, Math.max(4096, 3000 + docPages * 240));
  const requestedAttachments = visionDeck ? slideImages! : inPrompt ? [] : [pdf];
  const providerAttachments = await Promise.all(requestedAttachments.map(ensureAttachmentData));

  const gen = await adapter
    .generate(
      {
        system:
          'You extract grounded, verbatim-quoted claims from a document and return strict JSON only.',
        history: [],
        // Hand the model the extracted page text to quote from. For a text-rich PDF (and Office/text)
        // this is the ONLY source, so every quote is drawn from the exact text the grounding gate checks.
        user: visionDeck
          ? VISION_MAP_PROMPT
          : deepPages
            ? `${MAP_PROMPT}\n\n${selectedPagesToPrompt(pages!, deepPages, DEEP_PER_PAGE, pageLabels)}`
            : `${MAP_PROMPT}\n\n${pagesToPrompt(pages!, pageLabels)}`,
        // Image deck → the slide images; text-rich PDF / Office / text → no attachment (text in prompt);
        // a scanned PDF (no extractable text) → the PDF itself, so the model can read it visually.
        attachments: providerAttachments,
        maxTokens: mapTokens,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    )
    .then((out) => ({ ok: true as const, raw: out.raw }))
    .catch((err: unknown) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : 'request failed',
    }));

  // Keep the already-extracted text even though the model call failed — it's real and Ask It (and a
  // retry) still needs it; only a vision deck has no independent text (pages is null there).
  if (!gen.ok)
    return {
      fileName: pdf.name,
      pages: pages ?? [],
      claims: [],
      proposed: 0,
      error: gen.error,
      ...(pageLabels ? { pageLabels } : {}),
    };

  const candidates = parseResponse(gen.raw);
  // For an image deck, the slides have no text file to verify against — the model's transcription IS
  // the source. Build a per-slide grounding corpus from the candidate quotes so the same grounding
  // gate (quote appears on its page) holds, then ground normally.
  const groundingPages = visionDeck ? buildVisionPages(candidates, slideImages!.length) : pages!;
  const grounded = await groundClaimsOffMain(candidates, groundingPages);
  // Bake-script diagnostics only (SNAP_DEBUG=1): show which candidate quotes failed to ground so
  // noisy-source recovery can be tuned against real model output. Inert in the browser.
  if (typeof process !== 'undefined' && process.env?.SNAP_DEBUG) {
    for (const c of candidates) {
      if (!grounded.some((g) => g.title === c.title && g.kind === c.kind)) {
        console.log(`   DROPPED p${c.page}: ${JSON.stringify((c.quote ?? '').slice(0, 130))}`);
      }
    }
  }
  const claims = grounded.map((c, i) => ({
    id: `d${source}c${i}`,
    quote: c.quote,
    page: c.page,
    kind: asKind(c.kind),
    title: c.title?.trim() || c.quote.slice(0, 40),
    ask: c.ask?.trim() || 'What does this mean?',
    role: asRole(c.role),
    region: c.region?.trim() || 'Document',
    source,
    ...(c.contradictsPage ? { contradictsPage: c.contradictsPage } : {}),
    // The slide-image box rides along ONLY for the vision path — text docs highlight via their text.
    ...(visionDeck && c.box ? { box: c.box } : {}),
  }));
  return {
    fileName: pdf.name,
    pages: groundingPages,
    claims,
    proposed: candidates.length,
    ...(officeImages ? { slideImages: officeImages } : {}),
    ...(pageLabels ? { pageLabels } : {}),
  };
}

/** Build a per-slide grounding corpus for an image deck from the model's transcribed quotes: page i
 *  holds every quote the model placed on slide i. The grounding gate then verifies each quote against
 *  its own slide trivially (the slides have no underlying text), while still dropping any claim whose
 *  page is out of range. `slideCount` bounds the pages so a hallucinated page number is rejected. */
function buildVisionPages(
  candidates: ReturnType<typeof parseResponse>,
  slideCount: number,
): string[] {
  const pages = Array.from({ length: slideCount }, () => '');
  for (const c of candidates) {
    const p = typeof c.page === 'number' ? c.page : 0;
    if (p >= 1 && p <= slideCount && typeof c.quote === 'string') {
      pages[p - 1] += (pages[p - 1] ? '\n' : '') + c.quote;
    }
  }
  return pages;
}

/**
 * Explode one or more PDFs into a single grounded PrismSpec. Each document is mapped + grounded
 * independently, claims are tagged with their source, and — when there are 2+ documents — a
 * cross-document pass finds where the papers AGREE or CONTRADICT each other. `pagesOverride` (an
 * array, one entry per PDF) lets tests inject extracted text without pdf.js.
 */
export async function mapClaims(
  pdf: Attachment | readonly Attachment[],
  cfg: ModelConfig,
  signal?: AbortSignal,
  pagesOverride?: readonly (readonly string[])[] | readonly string[],
): Promise<MapClaimsResult> {
  const pdfs = Array.isArray(pdf) ? pdf : [pdf as Attachment];
  // pagesOverride is either one document's pages (single-PDF back-compat) or one array per PDF.
  const perDocPages: readonly (readonly string[] | undefined)[] = !pagesOverride
    ? pdfs.map((): readonly string[] | undefined => undefined)
    : Array.isArray(pagesOverride[0])
      ? (pagesOverride as readonly (readonly string[])[])
      : [pagesOverride as readonly string[]];

  const docResults = await Promise.all(
    pdfs.map((p, i) => mapOneDocument(p, cfg, i, signal, perDocPages[i])),
  );

  // If a model call failed outright (network), surface it. Per-document "no text/claims" is tolerated
  // as long as at least one document produced grounded claims. `proposed === 0` (not `pages.length`,
  // which a failed model call may still have populated from a successful extraction) is what marks a
  // doc as hard-failed — every failure branch below sets both `error` and `proposed: 0` together.
  const hardError = docResults.find((d) => d.error && d.proposed === 0);
  const allClaims = docResults.flatMap((d) => d.claims);
  const proposed = docResults.reduce((n, d) => n + d.proposed, 0);
  if (allClaims.length === 0) {
    return {
      spec: null,
      proposed,
      error:
        hardError?.error ??
        (proposed === 0
          ? 'No claims could be mapped from this document.'
          : 'No claims were grounded in the page text.'),
    };
  }

  // Same-document threads (the model's per-doc contradiction hints) — derived BEFORE we namespace
  // regions (threads key off id/source/page, not region).
  const threads = deriveThreads(allClaims);
  const multiDoc = pdfs.length > 1;
  if (!multiDoc) {
    const sameDocRelations = await sameDocumentCompare(allClaims, cfg, threads, signal);
    threads.push(...sameDocRelations);
  }

  // Cross-document threads — the headline of multi-PDF mode. Only runs with 2+ documents that each
  // produced claims; verified against the real claim set before any thread is drawn.
  if (multiDoc) {
    const crossable = docResults.filter((d) => d.claims.length > 0);
    if (crossable.length > 1) {
      const cross = await crossCompare(allClaims, cfg, signal);
      threads.push(...cross);
    }
  }

  const documents = docResults.map((d) => ({
    fileName: d.fileName,
    pageCount: d.pages.length,
    ...(d.slideImages ? { slideImages: d.slideImages } : {}),
    ...(d.pageLabels ? { pageLabels: d.pageLabels } : {}),
  }));

  // In multi-document mode, namespace each region by its document so two papers that both have an
  // "Introduction" cluster separately (and the layout groups each document's claims together).
  const renderClaims = allClaims.map(({ contradictsPage: _drop, ...c }) => c);
  if (multiDoc) {
    for (const c of renderClaims) {
      c.region = `${docLabel(documents[c.source]?.fileName ?? `Doc ${c.source + 1}`)} · ${c.region}`;
    }
  }

  const spec: PrismSpec = {
    documents,
    fileName: documents[0]?.fileName ?? 'document.pdf',
    pageCount: documents.reduce((n, d) => n + d.pageCount, 0),
    claims: renderClaims,
    regions: regionsOf(renderClaims),
    threads,
  };
  return { spec, proposed, corpus: docResults.map((d) => d.pages) };
}

/** The cross-document comparison prompt. The model sees the grounded claims (with ids + sources) and
 *  returns ONLY the pairs that genuinely relate across documents — we verify both ids are real. */
function crossPrompt(claims: readonly Claim[]): string {
  const lines = claims
    .map((c) => `${c.id} (doc ${c.source}, p.${c.page}): "${c.quote}"`)
    .join('\n');
  return `These are grounded claims pulled from MULTIPLE documents (doc 0, doc 1, …). Find pairs of
claims FROM DIFFERENT DOCUMENTS that relate, and classify each pair.

Claims:
${lines}

Return ONLY JSON (no prose):
{ "pairs": [ { "a": "<claim id>", "b": "<claim id>", "relation": "agrees|contradicts|in-tension" } ] }

Rules:
- a and b MUST be ids from the list above, and MUST come from different documents.
- "agrees": the two claims make the same point. "contradicts": they directly conflict.
  "in-tension": related but pulling different ways.
- Only include pairs with a real, defensible relationship. Quality over quantity (aim for the
  strongest 3-8 pairs). If nothing relates across documents, return { "pairs": [] }.`;
}

/** The same-document comparison prompt. It sees ONLY grounded claims: every id below is already a
 *  verbatim quote on a real page. This is the backstop for cases where the initial map captured both
 *  sides of a contradiction but omitted `contradictsPage`, including same-page contradictions. */
function sameDocumentPrompt(claims: readonly Claim[]): string {
  const lines = claims
    .map((c) => `${c.id} (doc ${c.source}, p.${c.page}, ${c.kind}): "${c.quote}"`)
    .join('\n');
  return `These are grounded claims pulled from one or more documents. Find pairs of claims FROM THE
SAME DOCUMENT that relate, and classify each pair.

Claims:
${lines}

Return ONLY JSON (no prose):
{ "pairs": [ { "a": "<claim id>", "b": "<claim id>", "relation": "contradicts|in-tension|agrees" } ] }

Rules:
- a and b MUST be ids from the list above, and MUST come from the same document.
- Contradictions can be on the SAME PAGE. Do not skip a pair just because both claims cite p.3.
- "contradicts": the claims directly conflict or one claim undercuts the other.
  "in-tension": related but pulling different ways. "agrees": the two claims make the same point.
- Only include defensible relationships visible from the quoted claims. Quality over quantity (aim for
  the strongest 1-8 pairs). If nothing relates, return { "pairs": [] }.`;
}

/** Ask which same-document grounded claim pairs relate; keep only real same-document ids and avoid
 *  duplicates already supplied by `contradictsPage` hints. */
async function sameDocumentCompare(
  claims: readonly Claim[],
  cfg: ModelConfig,
  existing: readonly Thread[],
  signal?: AbortSignal,
): Promise<Thread[]> {
  if (claims.length < 2) return [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  let raw: string | object;
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        system: 'You compare grounded claims within documents and return strict JSON only.',
        history: [],
        user: sameDocumentPrompt(claims),
        maxTokens: 1024,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = out.raw;
  } catch {
    return []; // a failed relation pass leaves the grounded map intact
  }

  const obj = extractJsonObject(raw);
  const pairs =
    obj && typeof obj === 'object' && Array.isArray((obj as Record<string, unknown>).pairs)
      ? ((obj as Record<string, unknown>).pairs as unknown[])
      : [];
  const threads: Thread[] = [];
  const seen = new Set(existing.map((t) => pairKey(t.a, t.b)));
  for (const p of pairs) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const a = byId.get(String(r.a));
    const b = byId.get(String(r.b));
    if (!a || !b || a.id === b.id || a.source !== b.source) continue;
    const key = pairKey(a.id, b.id);
    if (seen.has(key)) continue;
    seen.add(key);
    threads.push({ a: a.id, b: b.id, relation: relationOf(r.relation) });
  }
  return threads;
}

/** Ask the model which cross-document claim pairs relate; keep only pairs whose ids are real claims
 *  from different documents (so a thread always connects two passages that actually exist). */
async function crossCompare(
  claims: readonly Claim[],
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<Thread[]> {
  const byId = new Map(claims.map((c) => [c.id, c]));
  let raw: string | object;
  try {
    const out = await getAdapter(cfg.provider).generate(
      {
        system: 'You compare claims across documents and return strict JSON only.',
        history: [],
        user: crossPrompt(claims),
        maxTokens: 1024,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = out.raw;
  } catch {
    return []; // a failed cross-pass just means no cross threads — the per-doc map still stands
  }

  const obj = extractJsonObject(raw);
  const pairs =
    obj && typeof obj === 'object' && Array.isArray((obj as Record<string, unknown>).pairs)
      ? ((obj as Record<string, unknown>).pairs as unknown[])
      : [];
  const threads: Thread[] = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const a = byId.get(String(r.a));
    const b = byId.get(String(r.b));
    if (!a || !b || a.id === b.id || a.source === b.source) continue; // must be real + cross-document
    const rel = String(r.relation);
    const relation = relationOf(rel);
    const key = pairKey(a.id, b.id);
    if (seen.has(key)) continue;
    seen.add(key);
    threads.push({ a: a.id, b: b.id, relation, crossDoc: true });
  }
  return threads;
}
