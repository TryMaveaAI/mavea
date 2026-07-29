// The presentation lab's overflow audit — factored out of SlidesLab so both the interactive
// #/slidelab toggle and a headless driver (scripts/slide-gate.mts) run the exact same check.
import { auditCardOverlap } from '../../gallery/overflowAudit';
import type { Slide } from '../model/Slide';

/** Walk a rendered slide and report the first element whose content is being genuinely clipped —
 *  ignoring intentional line-clamps, ellipsis truncation, and decorative (aria-hidden) elements. */
export function auditPage(page: HTMLElement): string {
  const els = page.querySelectorAll<HTMLElement>('*');
  for (const el of els) {
    if (el.closest('[aria-hidden="true"]')) continue;
    // A figure manages its own fit: FigureEmbed scales the real component to its frame, whose
    // overflow:hidden is the deliberate scale container (not lost content). Its layout scrollHeight
    // exceeds the scaled clientHeight by design, so exempt the whole embed from the clip audit.
    if (el.closest('.figure-embed')) continue;
    // A hard-clip box (Press's drop-cap paragraph) is a deterministic, tier-sized bound that a
    // `-webkit-line-clamp` can't be used for (it breaks the float layout) — and a float's own
    // direct containing block reports a `scrollHeight` that over-counts its real rendered extent
    // in Chromium, so the raw scrollHeight/clientHeight gap here is a measurement artifact, not
    // lost content (see the marker's call site for how this was verified).
    if (el.closest('[data-hard-clip]')) continue;
    const cs = getComputedStyle(el);
    const clamp = cs.getPropertyValue('-webkit-line-clamp');
    const isClamped = clamp !== '' && clamp !== 'none';
    const isEllipsis = cs.textOverflow === 'ellipsis';
    const nowrap = cs.whiteSpace === 'nowrap';
    const clipsV = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const clipsH = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    // BandFit intentionally width-compensates its logical box before applying a uniform transform.
    // Chromium includes that pre-transform width in the parent's scrollWidth even when every
    // painted pixel fits. Exempt only a direct, marked BandFit child whose *visual* rect is actually
    // contained; a scale that still spills past the band remains a real failure.
    const bandFit = el.firstElementChild as HTMLElement | null;
    const bandFitContainment = (() => {
      if (!bandFit?.hasAttribute('data-bandfit')) return { horizontal: false, vertical: false };
      const outer = el.getBoundingClientRect();
      const inner = bandFit.getBoundingClientRect();
      const tolerance = 1;
      return {
        horizontal: inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance,
        vertical: inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance,
      };
    })();
    // A >4px gap on an unclamped, multi-line, clipping element is real lost content; single-line
    // (nowrap) and ellipsis nodes truncate by design, and ≤4px is sub-pixel line rounding.
    if (
      !bandFitContainment.vertical &&
      !isClamped &&
      !nowrap &&
      clipsV &&
      el.scrollHeight - el.clientHeight > 4
    ) {
      return `clipped ↕ ${el.scrollHeight - el.clientHeight}px in <${el.tagName.toLowerCase()}>`;
    }
    if (
      !bandFitContainment.horizontal &&
      !isClamped &&
      !isEllipsis &&
      clipsH &&
      el.scrollWidth - el.clientWidth > 4
    ) {
      return `clipped ↔ ${el.scrollWidth - el.clientWidth}px in <${el.tagName.toLowerCase()}>`;
    }
  }
  return '';
}

export interface SlideAuditFailure {
  index: number;
  kind: string;
  reason: string;
}

/** Sweep every `.slide-page` under `root`, in the document order the gallery renders them, pairing
 *  each positionally with the deck it came from so a failure can be reported against the slide's
 *  layout kind, not just its position. Returns only the slides that are actually clipping — an
 *  empty array means the whole deck audited clean. */
export function auditDeck(root: ParentNode, deck: Slide[]): SlideAuditFailure[] {
  const pages = root.querySelectorAll<HTMLElement>('.slide-page');
  const failures: SlideAuditFailure[] = [];
  pages.forEach((page, index) => {
    const reason = auditPage(page);
    if (reason) failures.push({ index, kind: deck[index]?.kind ?? '?', reason });
    // Clipping is only half the failure space: a grid item that ESCAPES its track (a shrink-
    // wrapped table cell wider than its column) clips nothing — the cells simply pile on top of
    // each other, which is how a split table's continuation slide once shipped illegible. The
    // gallery's sibling-collision detector catches exactly that class.
    const overlap = auditCardOverlap(page, 3);
    if (overlap) {
      failures.push({
        index,
        kind: deck[index]?.kind ?? '?',
        reason: `overlap ${Math.round(overlap.px)}px² between “${overlap.a}” and “${overlap.b}”`,
      });
    }
  });
  return failures;
}
