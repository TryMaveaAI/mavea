// The export lab's overflow audit — factored out of ExportLab so both the interactive toggle and
// a headless driver (scripts/export-gate.mts) run the exact same check. Mirrors the presentation
// lab's `slides/lab/audit.ts` almost exactly: same reasoning for what counts as a real clip versus
// a deliberate design (a line-clamp, a single-line `nowrap` label, an ellipsis truncation), applied
// to the document page's own equivalent of a "slide" — `.ex-page` — instead of `.slide-page`.
//
// Two constructs here fit content by shrinking it with a CSS `transform: scale()` rather than by
// clipping it, and both are exempted for the same reason: a `transform` changes what's PAINTED, not
// an element's own `scrollWidth`/`scrollHeight`, so a correctly-fitted instance and a genuinely
// clipped one measure identically by box comparison alone — `.figure-embed` (FigureEmbed scales the
// real component to its frame) and `[data-fit-line]` (FitLine shrinks a single line of text to its
// box — see parts.tsx for why).

/** A short, human-scannable identifier for a failing element: its tag, first class, and a text
 *  snippet when it has no element children (so a report reads as "span.ex-toc-page \"12\"" instead
 *  of just "span") — the same idea as the gallery overflow audit's own `describe()`. */
function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute('class') || '').split(' ')[0];
  const txt = el.childElementCount === 0 ? (el.textContent || '').trim().slice(0, 40) : '';
  return `${tag}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
}

/** Walk a rendered export page and report the first element whose content is being genuinely
 *  clipped — ignoring intentional line-clamps, single-line `nowrap` labels, ellipsis truncation,
 *  and decorative (aria-hidden) elements. Empty string means the page audited clean. */
export function auditPage(page: HTMLElement): string {
  const els = page.querySelectorAll<HTMLElement>('*');
  for (const el of els) {
    if (el.closest('[aria-hidden="true"]')) continue;
    // See the file header: both are deliberate transform-based fits, not places content silently
    // disappears.
    if (el.closest('.figure-embed')) continue;
    if (el.closest('[data-fit-line]')) continue;
    const cs = getComputedStyle(el);
    const clamp = cs.getPropertyValue('-webkit-line-clamp');
    const isClamped = clamp !== '' && clamp !== 'none';
    const isEllipsis = cs.textOverflow === 'ellipsis';
    const nowrap = cs.whiteSpace === 'nowrap';
    const clipsV = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const clipsH = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    // A >4px gap on an unclamped, multi-line, clipping element is real lost content; single-line
    // (nowrap) and ellipsis nodes truncate by design, and ≤4px is sub-pixel line rounding.
    if (!isClamped && !nowrap && clipsV && el.scrollHeight - el.clientHeight > 4) {
      return `clipped ↕ ${el.scrollHeight - el.clientHeight}px in <${describe(el)}>`;
    }
    if (!isClamped && !isEllipsis && clipsH && el.scrollWidth - el.clientWidth > 4) {
      return `clipped ↔ ${el.scrollWidth - el.clientWidth}px in <${describe(el)}>`;
    }
  }
  return '';
}

export interface ExportAuditFailure {
  /** 1-based page number within the current preview. */
  page: number;
  reason: string;
}

/** Sweep every `.ex-page` under `root`, in document order, and return only the pages that are
 *  actually clipping — an empty array means the whole preview audited clean. */
export function auditDoc(root: ParentNode): ExportAuditFailure[] {
  const pages = root.querySelectorAll<HTMLElement>('.ex-page');
  const failures: ExportAuditFailure[] = [];
  pages.forEach((page, index) => {
    const reason = auditPage(page);
    if (reason) failures.push({ page: index + 1, reason });
  });
  return failures;
}
