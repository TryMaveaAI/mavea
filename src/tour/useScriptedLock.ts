// useScriptedLock — while a scripted run is PERFORMING on the real Live surface (the first-run
// walkthrough or a curated demo replay), the visitor is the audience: the only controls are the
// run's own transport and whatever a chapter hands back. Both drivers inherit that from here.
//
// One seam, two halves. The POINTER half: every region of the app root except the run's chrome is
// marked `inert`, which turns off hit-testing, focus and find for the whole subtree — and it
// propagates into `position: fixed` descendants, so the overlays a chapter opens (the export
// studio, the palette, Present, the share sheet) are covered without a line of their own. The
// KEYBOARD half: one listener owns `keydown` for the whole scripted session, in the capture phase
// while the surface is locked, so the dozen window listeners underneath (push-to-talk, ⌘K, the
// Lens and Present arrows, four separate Escapes) never see a keystroke — capture beats them all
// whatever order they registered in, which `stopPropagation` from a sibling window listener never
// could.
//
// The choreography is untouched: a synthetic `.click()`, a dispatched event, a native value
// setter, `getBoundingClientRect`, `scrollIntoView` and `scrollTop` all keep working inside an
// inert subtree. `inert` stops the VISITOR's input, not the script's.
import { useEffect, useRef, type RefObject } from 'react';
import { transportKeyBelongsToControl } from './driverKit';

/** The run's own chrome: the walkthrough's panel and cards, the end card, the replay's frame.
 *  LiveApp renders all three as direct children of the app root, which is what lets one sweep over
 *  that root's children separate the performance from the controls the visitor keeps.
 *
 *  What is NOT in here leaves the accessibility tree too — `inert` is a whole-subtree switch, and
 *  there is no attribute that says "read this, but do not let anyone act on it". That is the right
 *  trade for a performance the visitor is watching rather than driving: both overlays wrap their
 *  coach line in an `aria-live` region, so a screen reader hears the run narrate itself chapter by
 *  chapter, and the board returns to the tree whole the moment the run ends. Swapping `inert` for
 *  `pointer-events: none` would keep the board readable and hand back exactly what the lock exists
 *  to prevent — a card activated from the virtual cursor is still a card press. */
const SCRIPT_CHROME = '.tourx, .tour-end, .demox';

/** Where focus belongs the moment the lock engages — the transport is the only place left to act
 *  from. Both panels carry `tabIndex={-1}` so they can take it themselves rather than dropping the
 *  visitor onto "Previous chapter". */
const TRANSPORT_PANEL = '.tourx-panel, .demox-panel';

/** The scrollers a locked run can be reading: the board, the desk's front card and its crib, the
 *  transcript and the rail's chat. Document order matters below — a descendant or a later sibling
 *  paints over what came before it. */
const SCROLLERS =
  '.canvas-scroll, .study-card.is-front .study-card-face, .study-crib-lines, .transcript-body, .rail-chat';

/** Where a gesture lands when nothing under it overflows: the board, so a wheel over the gutter
 *  still reads the answer. */
const CANVAS_SCROLLER = '.canvas-scroll';

/** Body children that draw nothing, so there is nothing in them to put out of reach. */
const UNRENDERED = 'script, style, link, template, noscript';

/** A wheel delta in pixels — deltaMode 1 is lines, 2 is pages; normalise so a mouse wheel travels
 *  like a trackpad. Shared with TourOverlay, which forwards the wheel over its own panel. */
export function wheelPixels(
  e: { deltaMode: number; deltaY: number },
  scroller: HTMLElement,
): number {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * scroller.clientHeight;
  return e.deltaY;
}

/** The scroller under a point while the surface is inert. `elementFromPoint` cannot answer — an
 *  inert subtree is not hit-testable, which is the whole reason the gesture needs forwarding — so
 *  the pick is geometric: the LAST candidate whose box holds the point and which actually
 *  overflows, since whatever comes later in the document is painted on top. Falls back to the
 *  board, and to nothing when this surface has no board (a takeover with no overflow). */
export function scrollerAt(app: HTMLElement, x: number, y: number): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const el of app.querySelectorAll<HTMLElement>(SCROLLERS)) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = el;
  }
  return found ?? app.querySelector<HTMLElement>(CANVAS_SCROLLER);
}

/** The four things a run's transport does. Both drivers expose exactly these. */
export interface ScriptedTransport {
  next: () => void;
  prev: () => void;
  toggle: () => void;
  skip: () => void;
}

export interface ScriptedLockOptions {
  /** The Live app root. Its children are the regions the lock puts out of reach. */
  root: RefObject<HTMLElement | null>;
  /** The run is performing: started and not finished. A PAUSED run still is — the intro and end
   *  cards are what bracket the performance, and both own their own choices. */
  running: boolean;
  /** The current chapter hands the surface back (tourPlan's `handsBack`): the transport keeps
   *  answering its keys, but nothing is locked, because the coach line just invited a real press. */
  handsBack: boolean;
  /** Null when this surface booted without a script. */
  transport: ScriptedTransport | null;
  /** LiveApp's single notion of "an overlay is holding attention" — it owns the step keys, so one
   *  ← can't step the replay under the very answer an open export studio is exporting. */
  layered: RefObject<boolean>;
}

export function useScriptedLock({
  root,
  running,
  handsBack,
  transport,
  layered,
}: ScriptedLockOptions): void {
  const locked = running && !handsBack;
  // The driver object is rebuilt every render; the listeners below must not be. Only whether there
  // is one at all is a dependency — a surface either booted under a script or it did not.
  const hasTransport = !!transport;
  const transportRef = useRef(transport);
  transportRef.current = transport;

  // THE KEYBOARD. One listener for the whole scripted session — the intro card and the end card
  // included, where Escape has always meant "leave" and the cards are the only thing on screen. In
  // the capture phase while the surface is locked and in the bubble phase otherwise, which is not a
  // detail: the arrow rule (transportKeyBelongsToControl) reads `defaultPrevented`, and in capture
  // the focused control has not acted yet. Locked, the only focusable controls left are the
  // transport's own — a button, on which the rule answers from the target alone — so the two
  // phases agree; before Start, after Done and while a chapter hands back, bubbling is what keeps
  // today's contract exact.
  useEffect(() => {
    if (!hasTransport) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = transportRef.current;
      if (!t) return;
      // Locked, the keyboard belongs to the run WHEREVER the focus sits — the transport included,
      // which is where the lock puts it. Exempting the run's own chrome was the hole: focus lands
      // on the panel, so every ⌘K the visitor pressed was aimed at the chrome and sailed through
      // to the palette underneath. Propagation stops here; the DEFAULT does not, which is what
      // keeps the transport usable — Tab still moves through its buttons and Space still presses
      // the focused one, both of which are browser behaviour rather than a listener. (Nothing in
      // either overlay handles keydown in React, so cutting the event above the root costs the
      // transport nothing.) The browser's own shortcuts are untouched: a page cannot cancel
      // reload or find, and pretending to would change nothing about the app underneath.
      if (locked) e.stopImmediatePropagation();

      // An overlay owns the screen: the transport keys belong to the TOP layer, Escape included.
      // Locked, that overlay cannot answer the key itself — but its own exit is still on screen
      // (the run's transport stays reachable however covered the surface gets), and ending the
      // whole walkthrough because the visitor reached to close a palette is the worse trade of the
      // two. So the key costs nothing here rather than everything.
      if (layered.current) return;
      if (e.key === 'Escape') {
        // Escape means one thing for as long as a script owns this surface: leave it.
        t.skip();
        return;
      }
      if (transportKeyBelongsToControl(e)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        t.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        t.prev();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        t.toggle();
      }
    };
    window.addEventListener('keydown', onKey, locked);
    return () => window.removeEventListener('keydown', onKey, locked);
  }, [hasTransport, locked, layered]);

  // THE SURFACE. Everything but the run's chrome goes inert, and stays inert as the script opens
  // more of it.
  useEffect(() => {
    if (!locked) return;
    const app = root.current;
    if (!app) return;
    // The body child the app lives in — everything ELSE under <body> is a portal (a card's overlay
    // block, an anchored menu, a clip sheet), which mounts outside the app root entirely and would
    // never be seen by a sweep of the root's own regions.
    const shell = app.closest('body > *');
    const held = new Set<Element>();
    const hold = (parent: Element, wanted: (el: Element) => boolean): void => {
      for (const el of Array.from(parent.children)) {
        // Skip anything already inert for its own reasons — the lock only ever releases what it
        // took.
        if (!wanted(el) || el.hasAttribute('inert')) continue;
        el.setAttribute('inert', '');
        held.add(el);
      }
    };
    const sweep = (): void => {
      hold(app, (el) => !el.matches(SCRIPT_CHROME));
      // `inert` means nothing on an element that renders nothing, and dev tooling parks a <script>
      // beside the shell — marking it would only be noise in the inspector.
      hold(document.body, (el) => el !== shell && !el.matches(UNRENDERED));
    };
    sweep();
    // A chapter opens overlays MID-run, each mounting as a fresh child of the root (or of <body>),
    // so the sweep follows the DOM rather than one render.
    const observer = new MutationObserver(sweep);
    observer.observe(app, { childList: true });
    observer.observe(document.body, { childList: true });

    // `inert` does not blur what already has focus — a focused composer keeps taking keystrokes
    // under an inert ancestor — so move focus to the transport, which is also where it belongs:
    // the visitor is never dropped into a region they cannot act in, and refocusing back out is
    // refused for as long as the lock holds.
    const panel = app.querySelector<HTMLElement>(TRANSPORT_PANEL);
    panel?.focus({ preventScroll: true });
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused !== document.body &&
      !focused.closest(SCRIPT_CHROME)
    ) {
      focused.blur();
    }

    // Hit-testing is off across the surface, so a wheel over the canvas finds no scroller and the
    // answer stops moving — and reading the answer at your own pace is the one gesture both scripts
    // promise (TourOverlay forwards the wheel over its own panel for exactly this reason). Forward
    // it for the rest of the surface, to whichever scroller is under the pointer — the desk's front
    // card and the transcript scroll on their own, and a wheel over them that moved the board
    // behind was the answer sliding away under a card that stayed put — taking the default with it
    // so there is only ever one scroller.
    const forwardable = (target: EventTarget | null): boolean => {
      // An overlay owns the screen: the canvas behind it is not what is being read.
      if (layered.current) return false;
      const el = target instanceof Element ? target : null;
      return !el?.closest(SCRIPT_CHROME);
    };
    const onWheel = (e: WheelEvent): void => {
      if (!forwardable(e.target)) return;
      const scroller = scrollerAt(app, e.clientX, e.clientY);
      if (!scroller) return;
      e.preventDefault();
      scroller.scrollTop += wheelPixels(e, scroller);
    };
    // The same gesture from a finger. Touch scrolling is the browser's own, and an inert region
    // gives it nothing to scroll, so a drag is carried by hand: the scroller is picked where the
    // finger lands and followed for the rest of the drag.
    let touchScroller: HTMLElement | null = null;
    let touchY = 0;
    const onTouchStart = (e: TouchEvent): void => {
      const touch = e.touches.length === 1 ? e.touches[0] : null;
      touchScroller =
        touch && forwardable(e.target) ? scrollerAt(app, touch.clientX, touch.clientY) : null;
      touchY = touch?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent): void => {
      const touch = e.touches.length === 1 ? e.touches[0] : null;
      if (!touch || !touchScroller) return;
      e.preventDefault();
      touchScroller.scrollTop += touchY - touch.clientY;
      touchY = touch.clientY;
    };
    const onTouchEnd = (): void => {
      touchScroller = null;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      observer.disconnect();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      for (const el of held) el.removeAttribute('inert');
    };
  }, [locked, root, layered]);
}
