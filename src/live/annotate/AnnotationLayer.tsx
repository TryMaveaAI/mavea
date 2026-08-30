// Mavéa's drawn gestures, mounted over the cards it has talked about. Each inked spot gets
// an SVG portal INSIDE its grid wrapper, so strokes scroll, dim, and persist with the card
// — an annotated block stays annotated after the walk, which is what makes it shareable.
//
// A gesture needs a reason. By default the pen moves only when the model authored a mark
// for the stop (its named on-card text, located down to the character range) — generous
// mode (teach mode, or a card the user tapped) widens targeting to the said words and the
// component's stamped salient node. Geometry is measured by polling until the target's own
// rendered box stops moving (the spotlight's centering scroll, a card's reveal animation, a
// spatial-canvas takeover), rather than guessing a fixed delay — a card where nothing resolves
// gets no ink — the hand only points at things that are really there.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { TourMark } from '../../engine/liveSchema';
import {
  gestureOf,
  labelPlacements,
  strokeFor,
  type Gesture,
  type InkStroke,
  type MarkExtra,
  type Rect,
} from './gesture';
import { firstClearPlace, intersects, occupiedRects } from './clearSpace';
import { measuredLabel } from './measure';
import {
  saidTokens,
  findSaidMatch,
  readSaidText,
  saidRect,
  saidRects,
  reachable,
  rowOf,
  type SaidText,
} from './saidTarget';
import { pollUntilSettled, lastVisible } from './settle';
import { MarginNoteRail } from './MarginNoteRail';
import './annotate.css';

interface Placed {
  host: HTMLElement;
  /** Where the ink SVG is portalled INTO. The card itself by default, but the target's own inner
   *  scroll container when the target lives in one — so the ink scrolls AND clips with the items
   *  instead of floating over a fixed spot on the card while the list moves underneath it. */
  container: HTMLElement;
  stroke: InkStroke;
  /** The resolved target's own local rect, in host coordinates — where a step badge (when this
   *  mark is part of a numbered sequence) anchors, independent of each gesture kind's own
   *  stroke geometry. */
  anchor: Rect;
  /** The host's VISUAL size (its on-screen rect) — the SVG's viewBox, so geometry plotted in
   *  visual space lands on the pixels the reader sees whatever transforms scaled the card. */
  view: { w: number; h: number };
  /** Where the numbered step chip may sit — the first clear-space candidate around the target.
   *  Absent when the card is too dense for any spot: the chip stays undrawn (the 900ms draw
   *  stagger still carries the order), because a chip PARKED ON TEXT blocks the very words the
   *  sequence is teaching. */
  chip?: { x: number; y: number };
}

/** The pen's hand is a WEB font now (Caveat, self-hosted), and it only starts downloading when
 *  something using it is first laid out. With `font-display: swap` that means the first written
 *  aside paints in the fallback and re-paints a beat later — invisible on a warm page, but the
 *  video export rasterizes frames as fast as it can and would bake those fallback glyphs in.
 *  `document.fonts.ready` cannot help: it resolves against loads already PENDING, and nothing is
 *  pending until the note renders (the same race src/export/render/fonts.ts documents). So ask for
 *  the face explicitly the moment any ink exists — the note's own entrance is delayed ~0.5s behind
 *  its stroke, which is ample head start for a same-origin 75KB file. Idempotent, fire-and-forget,
 *  and it costs nothing on a canvas that draws no ink at all. */
const HAND_FACE = '600 16px Caveat';
let handWarmed = false;
function warmHand(): void {
  if (handWarmed) return;
  handWarmed = true;
  try {
    void document.fonts?.load?.(HAND_FACE);
  } catch {
    /* no font loading API (jsdom, old engines) — the fallback stack still renders. */
  }
}

/** The step chip's radius — mirrored by `.ink-step-dot`'s r in SpotInk's render below. */
const CHIP_R = 9;

interface Target {
  rect: DOMRect;
  kind: Gesture;
  /** The matched target element — measure() walks up from it to find an inner scroll container. */
  el?: HTMLElement;
  /** Far anchor for a span gesture (trend end / bracket far side / brace last row), when its
   *  `to` text resolved. */
  toRect?: DOMRect;
  /** Caption text for a note, a bracket delta, or a brace's group label. */
  label?: string;
  /** Every line box of a wrapped highlight target — one marker band per line. */
  rects?: DOMRect[];
}

/** The span gestures read a second anchor (and some a caption) off the model's mark. */
function isSpan(kind: Gesture): boolean {
  return kind === 'rising' || kind === 'falling' || kind === 'bracket' || kind === 'brace';
}

/** Build a Target for a resolved primary rect, attaching the far anchor (a span's `to`, located
 *  the same exacting way as `at`, so the stroke lands on the real element — never a guess) and
 *  the caption a note / bracket carries. A span whose `to` text isn't on screen keeps only its
 *  near anchor — the geometry then degrades to a single precise arrow rather than a vague sweep. */
function withSpan(rect: DOMRect, mark: TourMark, said: SaidText): Target {
  const t: Target = { rect, kind: mark.kind };
  if (isSpan(mark.kind) && mark.to) {
    const mt = said.find([mark.to]);
    const rt = mt && saidRect(mt);
    if (rt) t.toRect = rt;
  }
  // A bracket spans two named items, and once BOTH ends resolved on screen the gap between them
  // is something the pen can measure rather than repeat — see measure.ts. Restricted to `bracket`
  // deliberately: a brace's `to` is the last ROW of a group, so a first-to-last delta would be a
  // figure about two rows dressed up as one about the group.
  const label =
    mark.kind === 'bracket' && t.toRect && mark.to
      ? measuredLabel(mark.at, mark.to, mark.label)
      : mark.label;
  if ((mark.kind === 'note' || mark.kind === 'bracket' || mark.kind === 'brace') && label) {
    t.label = label;
  }
  return t;
}

/** Resolve what to draw on. A gesture needs a REASON: the model named a target for this
 *  stop (always honored — its `at` text first, the component's stamped salient node as the
 *  landing fallback for that intent), or the request is generous (teach mode / a tapped
 *  card), where the said words and stamped marks may carry the pen. No reason, no ink. */
function findTarget(
  host: HTMLElement,
  line?: string,
  mark?: TourMark,
  generous = false,
): Target | null {
  if (mark) {
    // One read of the card's text for this whole resolution: the model's named text and a span's
    // far anchor come off the same walk.
    const said = readSaidText(host);
    const m = said.find([mark.at]);
    // `saidRect` first, and not only for its box: it is what refuses a target the reader cannot
    // SEE. A collapsed accordion keeps its text laid out and clips it to no height, so the words are
    // findable and their box sits at the closed section's own position — the row path below would
    // happily loop that blank space beside the header. Asked once, up front, so both paths inherit
    // the answer.
    const saidBox = m && saidRect(m);
    if (m && saidBox) {
      // Circling a LABEL should loop its whole row (the bar and the value), the way a
      // hand would — but only when the row is genuinely loopable. A full-width strip
      // makes a degenerate flattened lasso, so those fall back to the word-box itself.
      if (mark.kind === 'circle') {
        const row = rowOf(m, host);
        const rr = row?.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        if (
          rr &&
          rr.width > 0 &&
          rr.width <= hr.width * 0.6 &&
          rr.height <= hr.height * 0.6 &&
          rr.width / Math.max(rr.height, 1) <= 5
        ) {
          return { rect: rr, kind: 'circle', el: m.node.parentElement ?? undefined };
        }
      }
      const t = withSpan(saidBox, mark, said);
      t.el = m.node.parentElement ?? undefined;
      // A phrase that WRAPS reports one box per rendered line. Every glyph-hugging kind needs
      // them: a highlight re-touches each row, and an underline or circle drawn from the first
      // line's box alone strikes straight through its own wrapped words (the 'Pocket Wi-Fi'
      // bug — the range's bounding box spans both rows).
      if (mark.kind === 'highlight' || mark.kind === 'underline' || mark.kind === 'circle') {
        const rows = saidRects(m);
        if (rows.length > 1) t.rects = rows;
      }
      return t;
    }
    // Named text that IS on screen but clipped away — a collapsed section, a hidden tab — falls
    // through here too, and drops for the same reason: there is nowhere honest to draw.
    // The model intended a gesture here but its named text isn't actually on screen (re-worded,
    // split by streaming, or simply wrong) — drop it. A mark only ever attaches to text the model
    // explicitly pointed at; guessing a fallback location (the component's generic salient node)
    // would draw on something the model never actually named.
    return null;
  }
  if (!generous) return null;
  // Same again for the three passes below — the line's figures, then its names, then the labels
  // the card itself renders — which each asked the same unchanged card in its own walk. Lazy,
  // because a stamped `[data-mark]` can carry the pen without any of them reading text at all.
  let text: SaidText | null = null;
  const said = (): SaidText => (text ??= readSaidText(host));
  const tokens = line ? saidTokens(line) : null;
  if (tokens?.figures.length) {
    const m = said().find(tokens.figures);
    const r = m && saidRect(m);
    if (r) return { rect: r, kind: 'underline', el: m?.node.parentElement ?? undefined };
  }
  const stamped = host.querySelector<HTMLElement>('[data-mark]');
  const kind = gestureOf(stamped?.getAttribute('data-mark'));
  // reachable(): a card behind the Study's intro gate sits at opacity 0 and scale 0.22 — a
  // mark measured there draws ~4× oversized the moment the desk assembles. The said-text path
  // already refuses unreachable nodes inside saidRect; the stamped path must match it.
  if (stamped && kind && reachable(stamped)) {
    const r = stamped.getBoundingClientRect();
    if (r.width > 0) return { rect: r, kind, el: stamped };
  }
  if (tokens?.labels.length) {
    const m = said().find(tokens.labels);
    const r = m && saidRect(m);
    if (r) return { rect: r, kind: 'underline', el: m?.node.parentElement ?? undefined };
  }
  // Last resort before drawing nothing: a label the card renders that the line names in plain
  // prose. Everything above needs the line to carry a figure or a capitalized name, which a
  // conceptual walk over a diagram ("liquidity flows into the book") simply doesn't.
  if (line) {
    const echo = said().echoed(line);
    const r = echo && saidRect(echo);
    if (r) return { rect: r, kind: 'underline', el: echo?.node.parentElement ?? undefined };
  }
  return null;
}

/** The class the layer's own portal mount carries. Not styled anywhere but here. */
const INK_MOUNT = 'ink-mount';

/**
 * A node inside `container` that the annotation layer OWNS, to portal into.
 *
 * React removes a portal's child from its container on unmount. Aim a portal at the card and that
 * container is whatever the canvas is holding — replace the grid and the card's subtree is discarded,
 * so React asks a node that no longer holds the child to remove it and removeChildFromContainer
 * throws. Aim it at a node the layer created and never mutates, and the mount is discarded WITH the
 * svg still inside it: React's removal is then a node removing its own child, which cannot fail.
 *
 * `display: contents` so the mount generates no box at all — the ink goes on positioning against the
 * container, which is what every offset in `measure()` is computed against.
 *
 * Created lazily and reused. Nothing removes it: it belongs to the container's own lifetime, costs
 * one empty element, and removing it is what would reintroduce the race.
 */
function mountIn(container: HTMLElement): HTMLElement | null {
  const existing = container.querySelector<HTMLElement>(`:scope > .${INK_MOUNT}`);
  if (existing) return existing;
  const mount = document.createElement('div');
  mount.className = INK_MOUNT;
  mount.style.display = 'contents';
  container.appendChild(mount);
  return mount;
}

/** The innermost ancestor of `el` (up to but excluding `card`) that actually scrolls — a many-items
 *  list inside a card (`.cf-scroll`), or any overflow:auto/scroll region. Null when the target sits
 *  directly in the card. The ink portals INTO this so it rides the list's scroll and clips at its
 *  edges, instead of staying pinned to the card while the content moves out from under it. */
function scrollerOf(el: HTMLElement, card: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur && cur !== card) {
    const cs = getComputedStyle(cur);
    const scrollsY =
      cur.scrollHeight > cur.clientHeight + 1 && /(auto|scroll|overlay)/.test(cs.overflowY);
    const scrollsX =
      cur.scrollWidth > cur.clientWidth + 1 && /(auto|scroll|overlay)/.test(cs.overflowX);
    if (scrollsY || scrollsX) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** Ink this stop's EARLIER marks (lower step number) already drew into the same container —
 *  their strokes, dots, and written words, in viewport space. A later chip must not park on
 *  what the pen has already drawn; only earlier marks count, so placement can never oscillate
 *  (an earlier chip never dodges a later one). A layer whose own chip was dropped carries no
 *  number and is skipped — there's no honest way to order against it. */
function priorInkRects(container: HTMLElement, stepNumber: number): DOMRect[] {
  const out: DOMRect[] = [];
  // `:scope > .ink-mount > .ink-layer`, not `:scope > .ink-layer`: every layer portals into the
  // layer-owned mount now (see mountIn), so an ink layer is a grandchild of the container. Kept
  // structural rather than a loose descendant search — a nested card's ink is not this card's.
  for (const layer of Array.from(
    container.querySelectorAll<SVGSVGElement>(`:scope > .${INK_MOUNT} > .ink-layer`),
  )) {
    const n = Number(layer.querySelector('.ink-step-num')?.textContent);
    if (!Number.isFinite(n) || n >= stepNumber) continue;
    for (const el of Array.from(
      layer.querySelectorAll<SVGGraphicsElement>(
        '.ink-stroke, .ink-fill, .ink-step-dot, .ink-note',
      ),
    )) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push(r);
    }
  }
  return out;
}

function measure(
  spot: string,
  line?: string,
  mark?: TourMark,
  generous?: boolean,
  within?: HTMLElement | null,
  stepNumber?: number,
): Placed | null {
  const hosts = (within ?? document).querySelectorAll<HTMLElement>(
    `[data-spot-id="${CSS.escape(spot)}"]`,
  );
  const host = lastVisible(hosts);
  if (!host) return null;
  const target = findTarget(host, line, mark, generous);
  if (!target) return null;
  const hostRect = host.getBoundingClientRect();
  if (hostRect.width <= 0 || hostRect.height <= 0) return null;
  // If the target lives inside an inner scroll region (a many-items list), the ink must ride that
  // scroll, not the card — otherwise it stays pinned to a fixed spot while the list moves under it.
  // Portal into the scroller and plot geometry in its CONTENT space; a non-scrolling card is
  // unchanged: container === host, geometry relative to the host's own visual rect.
  const scroller = target.el ? scrollerOf(target.el, host) : null;
  const container = scroller ?? host;
  if (scroller && getComputedStyle(scroller).position === 'static') {
    // The absolutely-positioned ink SVG anchors to its nearest POSITIONED ancestor — make that the
    // scroller so content coords map straight onto it. Idempotent; a no-op if already positioned.
    scroller.style.position = 'relative';
  }
  const scrRect = scroller ? scroller.getBoundingClientRect() : null;
  // The scroller's content space is LAYOUT px — scrollWidth/scrollHeight (the SVG's viewBox and
  // inline size below) ignore ancestor transforms — while every measured rect is VISUAL px
  // (getBoundingClientRect bakes the spotlight's 1.03 in). Divide the visual deltas back by the
  // ancestor scale so both live in layout space; without it a spotlit card draws its
  // inner-scroller ink ~3% oversized and displaced. The card branch needs no correction: its SVG
  // fills the host (layout size) with a viewBox of the host's VISUAL rect, so the two scales
  // cancel by construction.
  const scale =
    scrRect && scrRect.width > 0 && scroller!.offsetWidth > 0
      ? scrRect.width / scroller!.offsetWidth
      : 1;
  const box = scroller
    ? { w: scroller.scrollWidth, h: scroller.scrollHeight }
    : { w: hostRect.width, h: hostRect.height };
  // For a plain card, geometry lives in VISUAL space via subtraction from the host's rect — any
  // transform scaling the card scales the ink identically. For a scroller, the same subtraction
  // runs from the content's top-left (its rect minus its scroll offsets), de-scaled into the
  // content's own layout space, so a mark on a scrolled-out item lands at the right place in the
  // content and simply clips until scrolled into view.
  const toLocal = (rect: DOMRect): Rect =>
    scroller && scrRect
      ? {
          left: (rect.left - scrRect.left) / scale + scroller.scrollLeft,
          top: (rect.top - scrRect.top) / scale + scroller.scrollTop,
          width: rect.width / scale,
          height: rect.height / scale,
        }
      : {
          left: rect.left - hostRect.left,
          top: rect.top - hostRect.top,
          width: rect.width,
          height: rect.height,
        };
  const local = toLocal(target.rect);
  const hostBox: Rect = { left: 0, top: 0, width: box.w, height: box.h };
  const extra: MarkExtra = {
    ...(target.toRect ? { to: toLocal(target.toRect) } : {}),
    ...(target.label ? { label: target.label } : {}),
    ...(target.rects?.length ? { rects: target.rects.map(toLocal) } : {}),
  };
  // The card's content boxes, gathered at most once per measurement — labels, chips, and the
  // underline's tuck all consult the same set.
  let occupiedCache: Rect[] | null = null;
  const occupied = (): Rect[] => (occupiedCache ??= occupiedRects(container).map(toLocal));
  // Written words must find genuinely clear card space — never land over the card's own text
  // or controls (the failure that got the first written-aside feature pulled). Strokes are
  // exempt: they draw ON the data by design. When nothing clears: a label that merely
  // captions its stroke (bracket delta, brace group) is dropped and the stroke keeps drawing;
  // a label that IS the mark (a note's words, a question's "?") takes the whole mark with it.
  const writesWords =
    target.kind === 'note' ||
    target.kind === 'question' ||
    ((target.kind === 'bracket' || target.kind === 'brace') && !!extra.label);
  if (writesWords) {
    const text = target.kind === 'question' ? '?' : (extra.label ?? '');
    const place = firstClearPlace(
      labelPlacements(target.kind, local, hostBox, text, extra.to),
      occupied(),
    );
    if (place) extra.place = place;
    else if (target.kind === 'note' || target.kind === 'question') return null;
    else delete extra.label;
  }
  // An underline drawn at its usual comfortable offset runs straight through a tight sub-label
  // row (a KPI's caption under its value) — when the band below the target holds text, the
  // stroke tucks against the target's own baseline instead.
  if (target.kind === 'underline' || target.kind === 'circle') {
    const band: Rect = {
      left: local.left,
      top: local.top + local.height + 2,
      width: local.width,
      height: 9,
    };
    if (occupied().some((o) => intersects(band, o, 0))) extra.tight = true;
  }
  // A lasso swells SIDEWAYS too, and the below-band check cannot see that: on a table's header
  // row three circles on adjacent cells crossed each other and the neighbouring words. The
  // numbers are the circle's own geometry, not taste: at full swell the loop reaches up to
  // padX(8) + the minRx floor's overshoot ≈ 14px past a narrow label's end, plus ~3px of hand
  // wobble — so a neighbour inside 18px forces tight. Tight still reaches ~9px + wobble, so a
  // neighbour inside 12px cannot be circled honestly at all and the mark degrades to an
  // underline, which stays inside the target's own width by construction.
  if (target.kind === 'circle') {
    const others = occupied().filter((o) => !intersects(o, local, 0));
    const besideWithin = (gap: number): boolean => {
      const leftBand: Rect = {
        left: local.left - gap,
        top: local.top,
        width: gap,
        height: local.height,
      };
      const rightBand: Rect = {
        left: local.left + local.width,
        top: local.top,
        width: gap,
        height: local.height,
      };
      return others.some((o) => intersects(leftBand, o, 0) || intersects(rightBand, o, 0));
    };
    if (besideWithin(18)) extra.tight = true;
    if (besideWithin(12)) extra.crowded = true;
  }
  const stroke = strokeFor(target.kind, local, hostBox, spot, extra);
  if (!stroke) return null;
  // The numbered step chip is opaque UI, so it obeys the same law as written words: it sits in
  // the first clear pocket around the target — up-left, beside, up-right, below — and stays
  // undrawn when every pocket holds content.
  let chip: { x: number; y: number } | undefined;
  if (typeof stepNumber === 'number') {
    const cl = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
    const cands = [
      { x: local.left - CHIP_R - 2, y: local.top - CHIP_R - 2 },
      { x: local.left - CHIP_R - 4, y: local.top + local.height / 2 },
      { x: local.left + local.width + CHIP_R + 3, y: local.top - CHIP_R - 2 },
      { x: local.left - CHIP_R - 2, y: local.top + local.height + CHIP_R + 3 },
    ].map((c) => ({
      x: cl(c.x, CHIP_R + 1, hostBox.width - CHIP_R - 1),
      y: cl(c.y, CHIP_R + 1, hostBox.height - CHIP_R - 1),
    }));
    // The pocket must clear the card's content AND whatever this stop's earlier marks already
    // drew — chips are opaque UI, and two of them parked in the same gap (rows 1 and 2 of the
    // same tight list) read as a scribble, not a sequence.
    const inked = priorInkRects(container, stepNumber).map(toLocal);
    chip = cands.find((c) => {
      const box: Rect = {
        left: c.x - CHIP_R,
        top: c.y - CHIP_R,
        width: CHIP_R * 2,
        height: CHIP_R * 2,
      };
      return (
        !occupied().some((o) => intersects(box, o, 2)) && !inked.some((o) => intersects(box, o, 2))
      );
    });
  }
  return {
    host,
    container,
    stroke,
    anchor: local,
    view: { w: box.w, h: box.h },
    ...(chip ? { chip } : {}),
  };
}

// How long the "MAVÉA IS DRAWING" badge stays visible — covers the full stroke animation
// (1s) plus the arrowhead delay (0.96s + 0.28s) with a small buffer. When multiple marks
// draw sequentially (delayMs > 0), the caller extends this per-mark step below.
const BADGE_MS = 2400;
const MARK_STEP_MS = 900;
/** How long ONE gesture takes to fully draw: the stroke's 1s ink-draw keyframe plus the
 *  arrowhead's 0.96s + 0.28s follow-through. Exported so the walk can spread a stop's marks
 *  across its LINE's audio and still know when the last stroke lands. */
export const MARK_DRAW_MS = 2_240;

function SpotInk({
  spot,
  line,
  mark,
  generous,
  within,
  residue,
  delayMs,
  badgeMs,
  revision,
  stepNumber,
  onPlaced,
}: {
  spot: string;
  line?: string;
  mark?: TourMark;
  generous?: boolean;
  /** Fired once, the first time this mark actually lands on a card. The gesture track lists what
   *  Mavéa DREW, so a request whose target never resolves must never be advertised as a mark. */
  onPlaced?: () => void;
  /** Scopes host lookup to one surface — see AnnotationLayer's own doc. */
  within?: HTMLElement | null;
  /** True once the voice has moved on from this block: the stroke keeps its exact geometry and
   *  drops to residue weight, so the page accumulates into a marked-up artifact instead of a wall
   *  of equally-loud ink. */
  residue?: boolean;
  /** CSS animation delay in ms — for sequential multi-mark reveals. */
  delayMs?: number;
  /** How long to keep the "MAVÉA IS DRAWING" badge on the host. */
  badgeMs?: number;
  /** Bumped when the canvas layout changes (e.g. focus↔everything toggle) to force a
   *  fresh host lookup — the old portal target is stale after the DOM tree swaps. */
  revision?: number;
  /** This mark's 1-based position in a multi-step stop — draws a small numbered chip beside
   *  it so a teaching sequence reads in order. Omitted for a stop with only one mark. */
  stepNumber?: number;
}): ReactElement | null {
  const [placed, setPlaced] = useState<Placed | null>(null);
  useEffect(() => {
    // Deliberately NOT `setPlaced(null)` here: a dependency change (a revision bump from a view
    // swap, a late-arriving `line`) means the current placement might be stale, but it might also
    // still be exactly right — nulling it unconditionally is what made every mark flicker off and
    // back on together. Keep showing whatever's already placed and only replace it once a fresh
    // measurement actually succeeds; if the old host turns out to be gone, its portal simply
    // renders into a detached node (invisible, harmless) until the new one resolves.
    return pollUntilSettled(
      () => measure(spot, line, mark, generous, within, stepNumber),
      // The chip joins the fingerprint: a chip that dodged an earlier mark's ink on a later
      // read must count as movement, so the dodge gets its own confirming read before settling.
      (p) => p.stroke.d + (p.chip ? `|${Math.round(p.chip.x)},${Math.round(p.chip.y)}` : ''),
      (p) => p.host,
      setPlaced,
      () => setPlaced(null),
    );
    // `residue` flips exactly when the walk's live spot arrives on (or leaves) this block —
    // which on the Study is the moment its card travels to the desk. Re-measuring then is what
    // lets a mark whose earlier poll gave up (its card was scenery) finally land.
  }, [spot, line, mark, generous, within, revision, stepNumber, residue]);

  // Report the first landing, once. The track lists drawn marks, not intended ones.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!placed || reportedRef.current) return;
    reportedRef.current = true;
    onPlaced?.();
  }, [placed, onPlaced]);

  // "MAVÉA IS DRAWING" badge: show while the stroke(s) animate, then fade.
  // Set duration and color BEFORE setting data-inking — CSS animations read both at start.
  useEffect(() => {
    if (!placed) return;
    const { host } = placed;
    const duration = badgeMs ?? BADGE_MS;
    host.style.setProperty('--ink-badge-dur', `${duration / 1000}s`);
    host.dataset.inking = mark?.color === 'key' ? 'key' : mark?.color === 'cool' ? 'cool' : '';
    const t = window.setTimeout(() => {
      delete host.dataset.inking;
      host.style.removeProperty('--ink-badge-dur');
    }, duration);
    return () => {
      window.clearTimeout(t);
      delete host.dataset.inking;
      host.style.removeProperty('--ink-badge-dur');
    };
  }, [placed, mark?.color, badgeMs]);

  // Never portal into a host that's no longer in the document. When a canvas restore/replace swaps
  // the whole grid, the card this ink was placed on unmounts; the effect above deliberately keeps
  // the old `placed` until a fresh measurement resolves (right for a viewMode re-layout where the
  // card persists). Bailing out until measure() finds a live host is the safe path — the mark simply
  // re-draws on the new card.
  //
  // The check alone is not enough, and this is the race it cannot see: the container is connected
  // when this renders and detached by the time React unmounts the portal, which is every canvas
  // replace. React then asks the container to remove a child it no longer holds,
  // removeChildFromContainer throws "node to be removed is not a child", and the RootBoundary blanks
  // the canvas — the commit aborts before TopicCanvas's block-family effect runs, so a resumed answer
  // renders empty and the turn's own provider call is aborted with it. Seen twice on live turns.
  //
  // So the portal aims at a MOUNT the layer owns (see `mountIn`), never at the card. When the card's
  // subtree is discarded the mount goes with it still holding the svg, so React's removal is a node
  // removing its own child and cannot fail. The mount generates no box (`display: contents`), so the
  // ink still positions against the container exactly as before.
  if (!placed || !placed.container.isConnected) return null;
  const { host, container, stroke, view, chip } = placed;
  const mount = mountIn(container);
  if (!mount) return null;
  const colorAttr = mark?.color && mark.color !== 'warm' ? mark.color : undefined;
  // `.ink-layer` fills the card (inset:0). When the ink instead lives in a scroll container, it must
  // cover the FULL scroll content from its top-left so a mark anywhere in the list lands right and
  // rides the scroll — override the inset + size inline for that case only.
  const scrolled = container !== host;
  const inkStyle = {
    ...(delayMs ? { '--ink-delay': `${delayMs}ms` } : {}),
    ...(scrolled
      ? {
          inset: 'auto',
          top: 0,
          left: 0,
          width: `${Math.max(1, Math.round(view.w))}px`,
          height: `${Math.max(1, Math.round(view.h))}px`,
        }
      : {}),
  } as React.CSSProperties;
  return createPortal(
    // viewBox = the container's size; the element fills it (the card, or the full scroll content).
    // Together they map visual-space geometry back onto the exact on-screen pixels. See measure().
    <svg
      className={'ink-layer' + (residue ? ' is-residue' : '')}
      aria-hidden="true"
      style={inkStyle}
      viewBox={`0 0 ${Math.max(1, Math.round(view.w))} ${Math.max(1, Math.round(view.h))}`}
      preserveAspectRatio="none"
    >
      {stroke.fill ? (
        // Highlight: a semi-transparent filled band that sweeps on like a marker stroke.
        <path
          className="ink-fill"
          d={stroke.d}
          {...(colorAttr ? { 'data-color': colorAttr } : {})}
        />
      ) : (
        <>
          {/* a faint wide pass under the stroke gives the line marker-ink softness */}
          <path
            className="ink-halo"
            d={stroke.d}
            pathLength={1}
            {...(colorAttr ? { 'data-color': colorAttr } : {})}
          />
          <path
            className="ink-stroke"
            d={stroke.d}
            pathLength={1}
            {...(colorAttr ? { 'data-color': colorAttr } : {})}
          />
          {stroke.head && (
            <path
              className="ink-stroke ink-head"
              d={stroke.head}
              pathLength={1}
              {...(colorAttr ? { 'data-color': colorAttr } : {})}
            />
          )}
        </>
      )}
      {stroke.label && (
        // A handwritten caption (note words / bracket delta / brace group / the question's "?")
        // — fades in after the stroke lands. A wrapped note carries newline-separated lines;
        // each renders as its own tspan so the aside reads as a few short hand-written rows,
        // never one long run-off. The "?" draws bigger than prose — it's a glyph, not a caption.
        <text
          className={'ink-note' + (stroke.kind === 'question' ? ' ink-glyph' : '')}
          x={stroke.label.x}
          y={stroke.label.y}
          textAnchor={stroke.label.anchor}
          {...(stroke.label.size ? { fontSize: stroke.label.size } : {})}
          {...(colorAttr ? { 'data-color': colorAttr } : {})}
        >
          {stroke.label.text.split('\n').map((row, ri) => (
            <tspan key={ri} x={stroke.label!.x} dy={ri === 0 ? 0 : '1.25em'}>
              {row}
            </tspan>
          ))}
        </text>
      )}
      {typeof stepNumber === 'number' && chip && (
        // A small numbered chip — appears only when this stop drew more than one mark, so a
        // teaching sequence ("first this, then that") reads in order rather than as several
        // unrelated highlights. Its spot came from the clear-space check in measure(); when no
        // pocket around the target is free of content, there is no chip at all — parking a
        // number ON the words it teaches blocks them.
        <g aria-hidden="true">
          <circle
            className="ink-step-dot"
            cx={chip.x}
            cy={chip.y}
            r={8}
            {...(colorAttr ? { 'data-color': colorAttr } : {})}
          />
          <text
            className="ink-step-num"
            x={chip.x}
            y={chip.y}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {stepNumber}
          </text>
        </g>
      )}
    </svg>,
    mount,
  );
}

/** Resolve a "connect" mark spanning TWO cards: `at` in `spot`'s own host, `to` in `toSpot`'s —
 *  never the same card (that's not a connection). Both rects are handed to `strokeFor` in
 *  VIEWPORT space against `.card-grid`'s own rect: `getBoundingClientRect()` already bakes in
 *  each card's own CSS scale (spotlit 1.03 / dimmed 0.984 / none), and `.card-grid` itself
 *  carries no transform, so plain subtraction lands correctly — no per-card scale correction
 *  needed the way the single-host `toLocal()` above requires. `.card-grid` doesn't exist in
 *  Focus mode (only the hero card is a real, measurable host there), so a connect mark simply
 *  draws nothing there — same "no reason, no ink" rule as everywhere else. */
function measureConnect(
  spot: string,
  toSpot: string,
  mark: TourMark,
  within?: HTMLElement | null,
): { grid: HTMLElement; stroke: InkStroke } | null {
  const root = within ?? document;
  const grid = root.querySelector<HTMLElement>('.card-grid');
  if (!grid) return null;
  const fromHosts = root.querySelectorAll<HTMLElement>(`[data-spot-id="${CSS.escape(spot)}"]`);
  const fromHost = lastVisible(fromHosts);
  const toHosts = root.querySelectorAll<HTMLElement>(`[data-spot-id="${CSS.escape(toSpot)}"]`);
  const toHost = lastVisible(toHosts);
  if (!fromHost || !toHost || fromHost === toHost) return null;
  const atMatch = findSaidMatch(fromHost, [mark.at]);
  const atRect = atMatch && saidRect(atMatch);
  const toMatch = mark.to ? findSaidMatch(toHost, [mark.to]) : null;
  const toRect = toMatch && saidRect(toMatch);
  if (!atRect || !toRect) return null;
  const gridRect = grid.getBoundingClientRect();
  const stroke = strokeFor('connect', atRect, gridRect, `${spot}>${toSpot}`, { to: toRect });
  return stroke ? { grid, stroke } : null;
}

function ConnectInk({
  spot,
  toSpot,
  mark,
  within,
  residue,
  delayMs,
  revision,
  onPlaced,
}: {
  spot: string;
  toSpot: string;
  mark: TourMark;
  within?: HTMLElement | null;
  /** True once the voice has moved on from this block: the stroke keeps its exact geometry and
   *  drops to residue weight, so the page accumulates into a marked-up artifact instead of a wall
   *  of equally-loud ink. */
  residue?: boolean;
  delayMs?: number;
  revision?: number;
  /** See SpotInk's `onPlaced`. */
  onPlaced?: () => void;
}): ReactElement | null {
  const [placed, setPlaced] = useState<{ grid: HTMLElement; stroke: InkStroke } | null>(null);
  useEffect(() => {
    // See SpotInk's identical effect above: never null the current placement on a dependency
    // change alone — only a fresh, successful measurement ever replaces it.
    return pollUntilSettled(
      () => measureConnect(spot, toSpot, mark, within),
      (p) => p.stroke.d,
      (p) => p.grid,
      setPlaced,
      () => setPlaced(null),
    );
  }, [spot, toSpot, mark, within, revision]);

  // Report the first landing, once — see SpotInk's twin.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!placed || reportedRef.current) return;
    reportedRef.current = true;
    onPlaced?.();
  }, [placed, onPlaced]);

  // Same detached-host guard as SpotInk, and the same mount for the same reason: a connect stroke
  // portals into the shared grid, which a canvas swap discards wholesale. Dropping out covers the
  // case where the grid is already gone; the mount covers the one where it goes AFTER this render.
  if (!placed || !placed.grid.isConnected) return null;
  const { grid, stroke } = placed;
  const mount = mountIn(grid);
  if (!mount) return null;
  const colorAttr = mark.color && mark.color !== 'warm' ? mark.color : undefined;
  const inkDelay = delayMs ? ({ '--ink-delay': `${delayMs}ms` } as React.CSSProperties) : undefined;
  return createPortal(
    <svg
      className={'ink-connect-layer' + (residue ? ' is-residue' : '')}
      aria-hidden="true"
      style={inkDelay}
    >
      <path
        className="ink-halo"
        d={stroke.d}
        pathLength={1}
        {...(colorAttr ? { 'data-color': colorAttr } : {})}
      />
      <path
        className="ink-stroke"
        d={stroke.d}
        pathLength={1}
        {...(colorAttr ? { 'data-color': colorAttr } : {})}
      />
      {stroke.head && (
        <path
          className="ink-stroke ink-head"
          d={stroke.head}
          pathLength={1}
          {...(colorAttr ? { 'data-color': colorAttr } : {})}
        />
      )}
    </svg>,
    mount,
  );
}

export interface InkRequest {
  spot: string;
  /** The shown line the voice spoke at this stop — drives said-target resolution. */
  line?: string;
  /** The model's own gesture request for this stop (kind + exact on-block text). */
  mark?: TourMark;
  /** Generous targeting (teach mode / a tapped card): said words and stamped marks may
   *  carry the pen even without a model-named target. */
  generous?: boolean;
  /** CSS animation delay in ms — used for sequential multi-mark reveals within one stop. */
  delayMs?: number;
  /** How long the "MAVÉA IS DRAWING" badge stays visible on this card. Defaults to BADGE_MS.
   *  The last mark in a multi-mark sequence extends this so the badge covers all strokes. */
  badgeMs?: number;
  /** This mark's 1-based position in a multi-step stop — see `SpotInk`'s doc. */
  stepNumber?: number;
  /** "connect" only: the OTHER block's data-spot-id — already resolved by the caller (which
   *  has the current spec's blocks[] to turn `mark.onIndex` into a real id). Its presence, not
   *  the mark kind, decides whether this request draws via the per-card portal or the
   *  cross-card one. */
  toSpot?: string;
  /** Mavéa's own margin note for this card (a muted walk writing its stop): rendered in the
   *  gutter rail BESIDE the grid — never over the card — so its presence routes the request to
   *  MarginNoteRail instead of a per-card stroke portal. */
  noteText?: string;
}

/** The step between sequential marks on the same stop, and the base badge duration,
 *  exported so LiveApp can compute total badge duration without duplicating constants. */
export { MARK_STEP_MS, BADGE_MS };

/** One portal per card Mavéa has gestured at this turn (LiveApp resets the list per turn).
 *  `within` scopes host lookup to one surface — the story stage passes its own frame so its
 *  ink can never land on the identical card in the live canvas behind the modal.
 *  `revision` should be bumped whenever the canvas layout changes (e.g. focus mode toggle)
 *  so each SpotInk re-locates its host in the new DOM tree. */
export function AnnotationLayer({
  spots,
  within,
  revision,
  onPlaced,
  liveSpot,
}: {
  spots: InkRequest[];
  within?: HTMLElement | null;
  revision?: number;
  /** Called with a request the first time its mark actually lands, so the caller can show a
   *  gesture track of what was DRAWN rather than what was attempted. */
  onPlaced?: (request: InkRequest) => void;
  /** The block the voice is on RIGHT NOW, when a walk is running. Marks on any other block are
   *  drawn as residue — still there, still the artifact, just no longer shouting. Without this
   *  every mark a walk ever drew stays at full weight, so by the sixth stop the page is a wall of
   *  equally-loud ink and none of it reads as "look here". Absent (or null) means no walk is
   *  running and nothing is residue: a finished page is read flat, all marks equal. */
  liveSpot?: string | null;
}): ReactElement | null {
  if (spots.length === 0) return null;
  warmHand();
  // Margin notes are one coordinated rail, not per-card portals — their vertical de-overlap
  // needs every note at once — so they split off here and the rest render exactly as before.
  const noteEntries = spots.filter((s) => s.noteText);
  const strokes = spots.filter((s) => !s.noteText);
  return (
    <>
      {noteEntries.length > 0 && (
        <MarginNoteRail
          notes={noteEntries.map((s) => ({ spot: s.spot, text: s.noteText! }))}
          within={within}
          revision={revision}
        />
      )}
      {/* One stroke per request — a block can hold SEVERAL (a circle here, an underline there),
          so the key includes the mark, not just the spot, to keep them distinct. A "connect"
          request (toSpot resolved) draws via the cross-card portal instead of the per-card one
          — its two ends may live in cards with different scale transforms and different
          overflow-clip boxes, neither of which SpotInk's single-host math is built for. */}
      {strokes.map((s, i) => {
        const key = `${s.spot}|${s.mark?.kind ?? ''}|${s.mark?.at ?? i}`;
        if (s.mark?.kind === 'connect' && s.toSpot) {
          return (
            <ConnectInk
              key={key}
              spot={s.spot}
              toSpot={s.toSpot}
              mark={s.mark}
              residue={!!liveSpot && s.spot !== liveSpot}
              within={within}
              delayMs={s.delayMs}
              revision={revision}
              onPlaced={onPlaced && (() => onPlaced(s))}
            />
          );
        }
        return (
          <SpotInk
            key={key}
            spot={s.spot}
            line={s.line}
            mark={s.mark}
            generous={s.generous}
            residue={!!liveSpot && s.spot !== liveSpot}
            within={within}
            delayMs={s.delayMs}
            badgeMs={s.badgeMs}
            revision={revision}
            stepNumber={s.stepNumber}
            onPlaced={onPlaced && (() => onPlaced(s))}
          />
        );
      })}
    </>
  );
}
