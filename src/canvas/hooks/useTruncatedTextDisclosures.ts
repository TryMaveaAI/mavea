import { useEffect, type RefObject } from 'react';

const ELLIPSIS = /…\s*$/u;
let disclosureId = 0;

function normalized(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

const HAS_INK = /\S/u;

/** Painted text for every element beneath `scope`, keyed by element and left un-normalized.
 *
 * textContent includes SVG <title>, even though that title is not painted. Exclude it when
 * deciding whether the visible label itself ends in an ellipsis.
 *
 * An element's painted text is its children's painted text joined, so resolving each element
 * against its own subtree re-reads every text node once per ancestor — quadratic across a card,
 * and the grid holds hundreds of them. Collecting bottom-up reads each node exactly once and
 * hands every ancestor the answer its children already computed. */
function paintedTextIndex(scope: Element): Map<Element, string> {
  const index = new Map<Element, string>();
  const collect = (el: Element): string => {
    if (el.tagName.toLowerCase() === 'title') {
      index.set(el, '');
      return '';
    }
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += `${node.textContent ?? ''} `;
      else if (node instanceof Element) text += `${collect(node)} `;
    }
    index.set(el, text);
    return text;
  };
  collect(scope);
  return index;
}

function actualCssTruncation(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  const single =
    style.textOverflow === 'ellipsis' &&
    style.whiteSpace.includes('nowrap') &&
    el.scrollWidth > el.clientWidth + 1;
  const clamp = style.webkitLineClamp || style.getPropertyValue('-webkit-line-clamp');
  const clampLines = Number.parseInt(clamp, 10);
  const clamped =
    Number.isFinite(clampLines) && clampLines > 0 && el.scrollHeight > el.clientHeight + 2;
  return single || clamped;
}

function fullTextFrom(el: Element): string {
  const directTitle = [...el.children].find((child) => child.tagName.toLowerCase() === 'title');
  return normalized(
    el.getAttribute('data-full-text') ||
      el.getAttribute('title') ||
      directTitle?.textContent ||
      el.getAttribute('aria-label'),
  );
}

function disclosureTarget(
  source: Element,
  visible: string,
  domTextIsComplete: boolean,
): { target: HTMLElement | SVGElement; full: string } | null {
  // CSS ellipsis/clamp does not alter the DOM: the painted text is the complete value even though
  // only part of it reaches the screen. Literal SVG ellipses still require explicit full-text
  // metadata.
  let full = fullTextFrom(source) || (domTextIsComplete ? visible : '');
  let target: Element = source;

  // A compact child label often inherits its complete description from the containing button or
  // plotted frame (Roadmap, FlameGraph). Only inspect the immediate parent: walking farther could
  // accidentally use the whole card's title as the label's expansion.
  if (!full || full === visible) {
    const parent = source.parentElement;
    const parentFull = parent ? fullTextFrom(parent) : '';
    if (parentFull && parentFull !== visible) {
      full = parentFull;
      target = parent!;
    }
  }

  if (
    !full ||
    (!domTextIsComplete &&
      (full === visible || full.length <= visible.replace(ELLIPSIS, '').length))
  )
    return null;
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return null;
  return { target, full };
}

function isNativeInteractive(el: Element): boolean {
  return el.matches('button, a[href], input, select, textarea, summary, [contenteditable="true"]');
}

interface Disclosure {
  source: Element;
  target: HTMLElement | SVGElement;
  full: string;
}

/** Whether `source` needs a disclosure, and on which element. Pure: reads style and layout, writes
 * nothing, so a whole scan's reads can run before its first write. */
function inspect(source: Element, painted: Map<Element, string>): Disclosure | null {
  if (source.hasAttribute('data-semantic-ellipsis')) return null;
  const raw = painted.get(source) ?? '';
  // An element that paints no text cannot be truncated, and across an SVG chart's paths, rects and
  // groups that is most of them — reject before paying for style.
  if (!HAS_INK.test(raw)) return null;
  const style = getComputedStyle(source);
  if (style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return null;
  const visible = normalized(raw);
  const cssTruncated = source instanceof HTMLElement && actualCssTruncation(source, style);
  if (!ELLIPSIS.test(visible) && !cssTruncated) return null;
  const disclosure = disclosureTarget(source, visible, cssTruncated);
  return disclosure ? { source, ...disclosure } : null;
}

/**
 * Make intentionally compact labels truthful on every input modality. A native `title` is not
 * enough on touch, so a truncated label with a complete title/aria/data value receives a visible
 * tooltip on hover, tap and keyboard focus. Labels without a full value remain audit failures.
 */
export function useTruncatedTextDisclosures(
  root: RefObject<HTMLElement | null>,
  revision: string | number | boolean,
): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;

    const id = `canvas-text-disclosure-${++disclosureId}`;
    const popover = document.createElement('div');
    popover.id = id;
    popover.className = 'canvas-text-popover';
    popover.setAttribute('role', 'tooltip');
    popover.hidden = true;
    document.body.appendChild(popover);

    const cleanups = new Map<Element, () => void>();
    const markedSources = new Set<Element>();
    const pending = new Set<HTMLElement>();
    let fullScan = false;
    let sawRemovals = false;
    let active: Element | null = null;
    let frame = 0;
    let hideTimer = 0;

    const position = (target: Element): void => {
      const r = target.getBoundingClientRect();
      const gap = 8;
      const edge = 12;
      popover.style.maxWidth = `${Math.max(180, Math.min(420, window.innerWidth - edge * 2))}px`;
      popover.style.left = '0px';
      popover.style.top = '0px';
      const p = popover.getBoundingClientRect();
      const left = Math.min(window.innerWidth - p.width - edge, Math.max(edge, r.left));
      const above = r.top - p.height - gap;
      const top =
        above >= edge ? above : Math.min(window.innerHeight - p.height - edge, r.bottom + gap);
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(Math.max(edge, top))}px`;
    };

    const hide = (): void => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = 0;
      active?.removeAttribute('data-text-disclosure-active');
      active = null;
      popover.hidden = true;
    };

    const show = (target: Element, full: string): void => {
      if (hideTimer) window.clearTimeout(hideTimer);
      active?.removeAttribute('data-text-disclosure-active');
      active = target;
      target.setAttribute('data-text-disclosure-active', 'true');
      popover.textContent = full;
      popover.hidden = false;
      position(target);
    };

    const apply = ({ source, target, full }: Disclosure): void => {
      source.setAttribute('data-text-disclosure', 'true');
      markedSources.add(source);
      if (cleanups.has(target)) return;

      const authoredTabIndex = target.hasAttribute('tabindex');
      const authoredRole = target.hasAttribute('role');
      const authoredLabel = target.getAttribute('aria-label');
      const authoredDescription = target.getAttribute('aria-describedby');
      if (!authoredTabIndex) target.setAttribute('tabindex', '0');
      if (!authoredRole && !isNativeInteractive(target)) target.setAttribute('role', 'button');
      if (!authoredLabel) target.setAttribute('aria-label', full);
      const descriptions = new Set(normalized(authoredDescription).split(' ').filter(Boolean));
      descriptions.add(id);
      target.setAttribute('aria-describedby', [...descriptions].join(' '));
      target.setAttribute('data-text-disclosure', 'true');

      const onEnter = () => show(target, full);
      const onLeave = () => {
        hideTimer = window.setTimeout(hide, 120);
      };
      const onClick = () => (active === target ? hide() : show(target, full));
      const onKeyDown = (event: Event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Escape') hide();
        if ((key === 'Enter' || key === ' ') && !isNativeInteractive(target)) {
          event.preventDefault();
          show(target, full);
        }
      };
      target.addEventListener('pointerenter', onEnter);
      target.addEventListener('pointerleave', onLeave);
      target.addEventListener('focus', onEnter);
      target.addEventListener('blur', onLeave);
      target.addEventListener('click', onClick);
      target.addEventListener('keydown', onKeyDown);

      cleanups.set(target, () => {
        target.removeEventListener('pointerenter', onEnter);
        target.removeEventListener('pointerleave', onLeave);
        target.removeEventListener('focus', onEnter);
        target.removeEventListener('blur', onLeave);
        target.removeEventListener('click', onClick);
        target.removeEventListener('keydown', onKeyDown);
        target.removeAttribute('data-text-disclosure');
        target.removeAttribute('data-text-disclosure-active');
        if (!authoredTabIndex) target.removeAttribute('tabindex');
        if (!authoredRole) target.removeAttribute('role');
        if (!authoredLabel) target.removeAttribute('aria-label');
        if (authoredDescription === null) target.removeAttribute('aria-describedby');
        else target.setAttribute('aria-describedby', authoredDescription);
      });
    };

    /** A mutation can newly truncate an ANCESTOR too (streamed text overfilling a clamped block),
     * so the incremental unit is the nearest child of `host` the mutation landed in — a card's
     * column div, or one section when the grid is sectioned; never the whole grid. Distinct
     * roots are disjoint subtrees, so one pass never visits an element twice. */
    const scanRootOf = (node: Node): HTMLElement | null => {
      let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
      while (el && el.parentElement !== host) el = el.parentElement;
      return el;
    };

    const scan = (): void => {
      frame = 0;
      if (sawRemovals) {
        sawRemovals = false;
        // Release unmounted targets now, not at effect teardown — otherwise every disclosed
        // element of a long answer stays strongly referenced (six listeners each) after React
        // removes it. Undoing attributes on a detached element is invisible; an element that
        // returns re-enters through the insertion scan.
        for (const [target, cleanup] of cleanups)
          if (!target.isConnected) {
            cleanup();
            cleanups.delete(target);
          }
        for (const source of markedSources)
          if (!source.isConnected) {
            source.removeAttribute('data-text-disclosure');
            markedSources.delete(source);
          }
      }
      const scopes = fullScan ? [host] : [...pending].filter((el) => host.contains(el));
      fullScan = false;
      pending.clear();
      // Decide first, write second. `[data-text-disclosure]` is a live selector, so a write between
      // two style reads invalidates style and makes the next getComputedStyle force a recalc — a
      // scope holds every inked element of a card, and a full scan the whole grid.
      const found: Disclosure[] = [];
      for (const scope of scopes) {
        const painted = paintedTextIndex(scope);
        if (scope !== host) {
          const disclosure = inspect(scope, painted);
          if (disclosure) found.push(disclosure);
        }
        for (const el of scope.querySelectorAll('*')) {
          const disclosure = inspect(el, painted);
          if (disclosure) found.push(disclosure);
        }
      }
      for (const disclosure of found) apply(disclosure);
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const scheduleFull = (): void => {
      fullScan = true;
      schedule();
    };
    const onOutsidePointer = (event: PointerEvent): void => {
      if (active && !active.contains(event.target as Node)) hide();
    };
    const reposition = (): void => {
      if (active && !popover.hidden) position(active);
    };

    scheduleFull();
    const afterAsyncPaint = window.setTimeout(scheduleFull, 700);
    // Streaming inserts one block at a time; re-walking the whole grid for each would be O(N²)
    // across a turn. The records already name what changed — rescan just those cards.
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            for (const record of records) {
              if (record.removedNodes.length) {
                sawRemovals = true;
                const scope = scanRootOf(record.target);
                if (scope) pending.add(scope);
              }
              for (const node of record.addedNodes) {
                const scope = scanRootOf(node);
                if (scope) pending.add(scope);
              }
            }
            if (pending.size || sawRemovals) schedule();
          });
    observer?.observe(host, { childList: true, subtree: true });
    // The host grows taller with every streamed block, but truncation is a function of an
    // element's own box, which follows from its content (the mutation scan's job) and the
    // available WIDTH — only a width change owes a full rescan.
    let hostWidth = -1;
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const width = entries.at(-1)?.contentRect.width ?? hostWidth;
            if (width === hostWidth) return;
            hostWidth = width;
            scheduleFull();
          });
    resizeObserver?.observe(host);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true, capture: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (hideTimer) window.clearTimeout(hideTimer);
      clearTimeout(afterAsyncPaint);
      observer?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      for (const cleanup of cleanups.values()) cleanup();
      for (const source of markedSources) source.removeAttribute('data-text-disclosure');
      popover.remove();
    };
  }, [root, revision]);
}
