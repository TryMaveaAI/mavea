// Your atlas — kept conversations and topics, as a place you fly through. Conversations cluster
// into neighborhoods named by your own words, glowing brighter the more you've talked there; tonight's
// session draws as a trail across the neighborhoods it touched. Three zoom tiers, one continuous
// motion: the galaxy of neighborhoods → a neighborhood's nights as a constellation → one night,
// rehydrated exactly as you left it. "Fly to…" finds the one you half-remember, "Fly the tour"
// flies it for you, and "Mavéa noticed" surfaces the open loops, the cross-life links, and the
// questions you keep circling. Every count, label, dot and insight is a real record — an empty
// atlas just says so.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import type { Chapter } from '../scrubber/chapters';
import { formatAgo } from '../library/time';
import type { AtlasRecord } from './store';
import { getLastAtlasOpen, markAtlasOpened } from './store';
import { clusterRecords, placeText, type Neighborhood } from './neighborhoods';
import {
  layoutNeighborhoods,
  fitAll,
  focusOn,
  zoomCamera,
  cameraTransform,
  tourOrder,
  type Camera,
  type HoodPlace,
} from './flight';
import { buildInsights, type AtlasInsight } from './insights';
import { connectionArcs, type Connection } from './connections';
import { starfield } from './starfield';
import './atlas.css';

type Tier = 'galaxy' | 'hood' | 'night';

/** Honest span label from the oldest record: days → weeks → months. */
function spanLabel(oldest: number, now: number): string {
  const d = Math.max(1, Math.floor((now - oldest) / 86_400_000));
  if (d < 14) return d === 1 ? '1 day' : `${d} days`;
  if (d < 60) return `${Math.floor(d / 7)} weeks`;
  return `${Math.floor(d / 30)} months`;
}

function rowLabel(r: AtlasRecord, max = 30): string {
  const s = (r.title || r.question).trim().replace(/\s+/g, ' ');
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** Build the synthesis question for a neighborhood's "Synthesize" button. A neighborhood is a
 *  loose vocabulary cluster, not a verified topic, so we deliberately do NOT claim every member
 *  is "about <name>" — that premise can be false (a stray travel question landing beside Boston
 *  trips). Instead we name the user's real conversation titles and an honest count, and let those
 *  titles speak for themselves; the model finds the actual common thread. */
function deeperAsk(records: readonly AtlasRecord[]): string {
  const named = records.slice(0, 5).map((r) => r.title || r.question);
  const more = records.length > named.length ? ', among others' : '';
  return `Looking across ${records.length} of my past conversations — ${named.join(', ')}${more} — what are the common threads, what did I learn, and what's still unresolved?`;
}

// A night card's footprint (the .atlas-night wrapper is ~188px wide; height ≈ a 2-line card). The
// spiral + separation below keep this much clear around each card so clicking into a hood spreads the
// nights out legibly instead of piling them on the hood centre (the radius is sized to the CARD, not
// to the now-small hood ellipse).
const NIGHT_W = 196;
const NIGHT_H = 84;

/** Lay a neighborhood's nights out as a constellation around the hood centre — a deterministic
 *  golden-angle spiral sized by the card footprint, then a separation pass so no two cards overlap.
 *  Newest nearest the centre; the same hood always reads the same way (pure, no randomness). */
function nightPlaces(count: number, place: HoodPlace): { x: number; y: number }[] {
  const GOLDEN = 2.399_963_22; // radians — the golden angle
  // The spiral step is the card's diagonal-ish size, so even a packed hood starts mostly clear; the
  // separation pass cleans up the rest. Scale up with count so a busy hood opens into more space.
  const step = Math.max(NIGHT_W, NIGHT_H) * 0.62;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i === 0) {
      out.push({ x: place.x, y: place.y });
      continue;
    }
    const r = step * Math.sqrt(i) * 1.05;
    const a = i * GOLDEN;
    out.push({ x: place.x + Math.cos(a) * r, y: place.y + Math.sin(a) * r * 0.82 });
  }

  // Separation: push overlapping cards apart along their axis of least overlap until none collide.
  const PAD_X = 18;
  const PAD_Y = 18;
  for (let pass = 0; pass < 160; pass += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = NIGHT_W + PAD_X - Math.abs(dx);
        const overlapY = NIGHT_H + PAD_Y - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const push = (overlapX / 2 + 0.5) * (dx < 0 ? -1 : 1);
            a.x -= push;
            b.x += push;
          } else {
            const push = (overlapY / 2 + 0.5) * (dy < 0 ? -1 : 1);
            a.y -= push;
            b.y += push;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

/** A loose, honest classifier for the artifact a night produced — for the rehydrated card's tile.
 *  Drawn from the conversation's own words; never invents a kind it can't justify. */
function artifactKind(r: AtlasRecord): string {
  const s = (r.title + ' ' + r.question).toLowerCase();
  if (/\b(map|route|trip|where|location|place)\b/.test(s)) return 'MAP';
  if (/\b(should|vs|versus|or|decide|choice|option)\b/.test(s)) return 'BRANCH';
  if (/\b(table|compare|list|rank|breakdown)\b/.test(s)) return 'TABLE';
  if (/\b(recipe|cook|bake|dish|dinner|meal)\b/.test(s)) return 'RECIPE';
  if (/\b(chart|trend|graph|growth|over time|history of)\b/.test(s)) return 'CHART';
  if (/\b(plan|steps|schedule|timeline)\b/.test(s)) return 'PLAN';
  return 'NOTE';
}

export function AtlasView({
  records,
  chapters,
  onLand,
  onGoDeeper,
  autoTour,
  onClose,
}: {
  records: AtlasRecord[];
  chapters: readonly Chapter[];
  onLand: (record: AtlasRecord) => void;
  /** Called with a synthesis question when the user asks to go deeper on a neighborhood. */
  onGoDeeper?: (question: string) => void;
  /** The first-run tour: auto-fly the guided route once the viewport is measured (no click). */
  autoTour?: boolean;
  onClose: () => void;
}): ReactElement {
  const hoods = useMemo(() => clusterRecords(records), [records]);
  const layout = useMemo(() => layoutNeighborhoods(hoods), [hoods]);
  const places = layout.places;
  const world = useMemo(() => ({ w: layout.width, h: layout.height }), [layout]);

  // Snapshot the last-open timestamp before marking this visit — new badges stay stable
  // for the duration of this session even if the user opens Atlas multiple times.
  const lastOpenRef = useRef(getLastAtlasOpen());
  useEffect(() => {
    markAtlasOpened();
  }, []);

  // Tonight's trail: each chapter mapped to the neighborhood sharing its vocabulary,
  // consecutive repeats folded (staying in one neighborhood isn't a journey).
  const trail = useMemo(() => {
    const idx: number[] = [];
    for (const ch of chapters) {
      const at = placeText(ch.title + ' ' + (ch.moments[0]?.question ?? ''), hoods);
      if (at >= 0 && idx[idx.length - 1] !== at) idx.push(at);
    }
    return idx;
  }, [chapters, hoods]);

  // Connection time-window: which span the cross-life arcs are drawn over. "All" is your whole
  // history; "month"/"week" surface only the recent co-occurrences. Default to all time so the
  // galaxy shows the most connections on open; the switcher narrows it.
  const [range, setRange] = useState<'all' | 'month' | 'week'>('all');

  // Cross-life connections + "Mavéa noticed" insights — derived from the real record set, never
  // fabricated. The galaxy is deterministic, so these are stable for a given atlas + window.
  const connections = useMemo<Connection[]>(() => {
    const sinceMs = range === 'all' ? 0 : Date.now() - (range === 'month' ? 30 : 7) * 86_400_000;
    return connectionArcs(hoods, places, sinceMs);
  }, [hoods, places, range]);
  const insights = useMemo<AtlasInsight[]>(
    () => buildInsights(hoods, places, records, lastOpenRef.current),
    [hoods, places, records],
  );
  // The deterministic starfield — seeded once from the record count so it never reshuffles on
  // re-render. Memoized on length only (a stable bg, not a live data view).
  const stars = useMemo(() => starfield(records.length), [records.length]);

  // ── Tier / focus state ────────────────────────────────────────────────────
  const [tier, setTier] = useState<Tier>('galaxy');
  // Focus is kept by neighborhood ID, not array index: `hoods` is re-sorted largest-first on
  // every `records` change, so a raw index would silently point at a different neighborhood
  // the moment a fold-in reorders the list out from under an open hood/night view.
  const [focusHoodId, setFocusHoodId] = useState<string | null>(null);
  const focusHood = useMemo(
    () => (focusHoodId === null ? -1 : hoods.findIndex((h) => h.id === focusHoodId)),
    [focusHoodId, hoods],
  );
  const [focusNight, setFocusNight] = useState<string | null>(null);
  // Full-screen the atlas (edge-to-edge) vs the default large panel.
  const [expanded, setExpanded] = useState(false);

  // Camera: starts fit-to-view once the viewport has a size; flying is a CSS transition.
  const viewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  // Keep the latest tier readable inside the resize callback without re-subscribing the observer.
  const tierRef = useRef<Tier>('galaxy');
  tierRef.current = tier;
  // The world grows with the neighborhood count; a ref keeps the latest dims available to the
  // resize handler without re-subscribing the observer.
  const worldRef = useRef(world);
  worldRef.current = world;
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = (): void => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setView({ w, h });
      // Don't snap the camera out of a zoomed tier on a resize.
      if (tierRef.current === 'galaxy')
        setCamera(fitAll(w, h, worldRef.current.w, worldRef.current.h));
    };
    measure();
    // jsdom has no ResizeObserver; the mount measure above still runs there.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when the world size changes (e.g. a new neighborhood grows the map) while at the galaxy.
  useLayoutEffect(() => {
    if (tierRef.current === 'galaxy' && view) setCamera(fitAll(view.w, view.h, world.w, world.h));
  }, [world, view]);

  // ── Flying between tiers — one continuous camera motion ───────────────────
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFlying = useCallback(() => {
    if (flyTimer.current !== null) clearTimeout(flyTimer.current);
    flyTimer.current = null;
  }, []);
  useEffect(() => stopFlying, [stopFlying]);

  const enterHood = useCallback(
    (i: number) => {
      if (!view) return;
      stopFlying();
      setTier('hood');
      setFocusHoodId(hoods[i]?.id ?? null);
      setFocusNight(null);
      setCamera(focusOn(places[i], view.w, view.h));
    },
    [view, hoods, places, stopFlying],
  );

  const enterNight = useCallback(
    (id: string) => {
      stopFlying();
      setTier('night');
      setFocusNight(id);
      // The night card is an overlay centred in the viewport; the camera holds on the hood beneath it.
    },
    [stopFlying],
  );

  const backOut = useCallback(() => {
    if (!view) return;
    stopFlying();
    if (tier === 'night') {
      setTier('hood');
      setFocusNight(null);
    } else if (tier === 'hood') {
      setTier('galaxy');
      setFocusHoodId(null);
      setCamera(fitAll(view.w, view.h, world.w, world.h));
    }
  }, [tier, view, world, stopFlying]);

  // "Fly the tour" — galaxy → across the whole map (tonight's path first, then the rest by
  // proximity) → back to galaxy, one breath. The route covers the atlas, not just the session, so it
  // never stalls after a stop or two when the night only touched a couple of neighborhoods.
  const tour = useMemo(() => tourOrder(trail, places), [trail, places]);
  const flyTour = useCallback(() => {
    if (!view || tour.length === 0) return;
    stopFlying();
    let leg = 0;
    const step = (): void => {
      if (leg < tour.length) {
        const hoodIdx = tour[leg];
        setTier('hood');
        setFocusHoodId(hoods[hoodIdx]?.id ?? null);
        setFocusNight(null);
        setCamera(focusOn(places[hoodIdx], view.w, view.h));
        leg += 1;
        flyTimer.current = setTimeout(step, 1700);
      } else {
        setTier('galaxy');
        setFocusHoodId(null);
        setFocusNight(null);
        setCamera(fitAll(view.w, view.h, world.w, world.h));
        flyTimer.current = null;
      }
    };
    step();
  }, [view, tour, hoods, places, world, stopFlying]);

  // First-run tour: once the viewport is measured, fly the guided route automatically — once.
  const autoTourFired = useRef(false);
  useEffect(() => {
    if (!autoTour || autoTourFired.current || !view || tour.length === 0) return;
    autoTourFired.current = true;
    flyTour();
  }, [autoTour, view, tour.length, flyTour]);

  // Fly to… — find a conversation by what you remember of it.
  // "Mavéa noticed" starts minimized as a small corner pill so it never sits on top of the
  // neighborhoods; clicking the pill opens the full panel.
  const [noticedOpen, setNoticedOpen] = useState(false);

  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return records
      .filter((r) => r.question.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, records]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const flyToRecord = useCallback(
    (r: AtlasRecord) => {
      const at = hoods.findIndex((h) => h.records.some((m) => m.id === r.id));
      if (at >= 0) enterHood(at);
      setHighlightId(r.id);
      setQuery('');
    },
    [hoods, enterHood],
  );

  // Scroll zoom only matters in the galaxy (the hood/night tiers are framed views).
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (tier !== 'galaxy') return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      stopFlying();
      setCamera((c) => zoomCamera(c, factor, fx, fy));
    },
    [tier, stopFlying],
  );

  // ── Click-and-drag to pan ──────────────────────────────────────────────────
  // Grab anywhere on the sheet and move the map. We track the drag on a ref (no re-render per
  // pointermove) and only treat it as a drag once the pointer travels past a small threshold, so a
  // plain click still falls through to enter a neighborhood. `panMoved` is read by the capture-phase
  // click suppressor below to swallow the click that ends a real drag.
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const panMoved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // left-button only
    // Record the start but DON'T capture yet — capturing here redirects the trailing `click` to the
    // viewport and neighborhoods would never receive it. Capture only once a real drag begins.
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    panMoved.current = false;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return; // below threshold — still a potential click
      if (!d.moved) {
        d.moved = true;
        setPanning(true);
        stopFlying();
        // Now it's a drag: capture so a fast pan that leaves the viewport keeps streaming moves.
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(d.id);
        } catch {
          /* capture optional */
        }
      }
      d.x = e.clientX;
      d.y = e.clientY;
      panMoved.current = true;
      setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    },
    [stopFlying],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const wasMove = d.moved;
    if (wasMove) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(d.id);
      } catch {
        /* capture may already be gone */
      }
    }
    drag.current = null;
    setPanning(false);
    // panMoved must stay true through the trailing click (onClickCapture swallows it). But on touch /
    // out-of-bounds release the click may never fire, so clear it next frame so the NEXT real click
    // isn't eaten. A genuine trailing click runs before this rAF and resets panMoved itself.
    if (wasMove) requestAnimationFrame(() => (panMoved.current = false));
  }, []);

  // Swallow the click that terminates a real drag, so releasing a pan over a neighborhood doesn't
  // also "click" it. Runs in the capture phase, before the hood button's own onClick.
  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (panMoved.current) {
      e.stopPropagation();
      e.preventDefault();
      panMoved.current = false;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (tier !== 'galaxy') backOut();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tier, backOut, onClose]);

  const now = Date.now();
  const oldest = records.length ? Math.min(...records.map((r) => r.firstSeen)) : now;
  const artifacts = useMemo(
    () => records.reduce((n, r) => n + (r.blocks > 2 ? 1 : 0), 0),
    [records],
  );
  const meta =
    records.length === 0
      ? 'Nothing here yet'
      : `${spanLabel(oldest, now)} · ${records.length} conversation${records.length === 1 ? '' : 's'} · ${artifacts} artifact${artifacts === 1 ? '' : 's'}`;

  // Current position: the last neighborhood touched tonight.
  const hereIdx = trail.length > 0 ? trail[trail.length - 1] : -1;

  const focusedHood: Neighborhood | null = focusHood >= 0 ? hoods[focusHood] : null;
  const focusedPlace = focusHood >= 0 ? places[focusHood] : null;
  const nights = useMemo(
    () =>
      focusedHood && focusedPlace ? nightPlaces(focusedHood.records.length, focusedPlace) : [],
    [focusedHood, focusedPlace],
  );
  const nightRecord = focusNight ? (records.find((r) => r.id === focusNight) ?? null) : null;

  // Breadcrumb label per tier.
  const crumb =
    tier === 'galaxy'
      ? 'Your atlas'
      : focusedHood
        ? focusedHood.name.charAt(0) + focusedHood.name.slice(1).toLowerCase()
        : 'Your atlas';

  const handleInsight = useCallback(
    (ins: AtlasInsight) => {
      if (ins.kind === 'open-loop' && ins.recordId) {
        const r = records.find((x) => x.id === ins.recordId);
        if (r) onLand(r);
      } else if (ins.hoodIndex >= 0) {
        enterHood(ins.hoodIndex);
      }
    },
    [records, onLand, enterHood],
  );

  return (
    <div
      className="atlas-scrim"
      data-expanded={expanded ? 'true' : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close atlas"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          onClose();
        }
      }}
    >
      <section className="atlas-panel" role="dialog" aria-label="Your atlas" data-tier={tier}>
        <header className="atlas-head">
          <div className="atlas-crumbs">
            {tier !== 'galaxy' && (
              <button
                type="button"
                className="atlas-back"
                onClick={backOut}
                aria-label={tier === 'night' ? 'Back to the neighborhood' : 'Back to the galaxy'}
              >
                ← {tier === 'night' && focusedHood ? crumb : 'Galaxy'}
              </button>
            )}
            <div className="atlas-title-wrap">
              <h2 className="atlas-title">{crumb}</h2>
              <span className="atlas-meta">
                {tier === 'galaxy'
                  ? meta
                  : focusedHood
                    ? `${focusedHood.records.length} conversation${focusedHood.records.length === 1 ? '' : 's'} · named from how you talk about it`
                    : meta}
              </span>
            </div>
          </div>
          {/* Wraps the search + tour button as one unit: `display: contents` on wide screens (they
              sit directly in .atlas-head's own row, unchanged), a real flex row that's forced onto
              its own full-width line below the crumbs on narrow screens (atlas.css) — a genuine
              restructure rather than the two just shrinking until they collide with the crumbs. */}
          <div className="atlas-head-search">
            <div className="atlas-fly">
              <input
                className="atlas-fly-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={'⌕ Fly to… “that thing about vesting”'}
                aria-label="Find a conversation"
              />
              {matches.length > 0 && (
                <ul className="atlas-fly-matches" role="listbox">
                  {matches.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="atlas-fly-match"
                        onClick={() => flyToRecord(r)}
                      >
                        <span className="atlas-fly-match-label">{rowLabel(r)}</span>
                        <span className="atlas-fly-match-ago">{formatAgo(r.savedAt, now)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {tour.length >= 2 && tier === 'galaxy' && (
              <button type="button" className="atlas-tour" onClick={flyTour}>
                ▶ Fly the tour
              </button>
            )}
          </div>
          <button
            type="button"
            className="atlas-close"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
            title={expanded ? 'Exit full screen' : 'Full screen'}
          >
            {expanded ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="atlas-close"
            onClick={onClose}
            aria-label="Close the atlas"
          >
            ✕
          </button>
        </header>

        <div
          className={'atlas-viewport' + (panning ? ' is-panning' : '')}
          ref={viewRef}
          onWheel={handleWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
        >
          {records.length === 0 ? (
            <p className="atlas-empty">
              Your atlas grows as you talk — every saved conversation becomes a place here.
            </p>
          ) : (
            <>
              {/* Starfield — a still backdrop, drawn in viewport space so it doesn't move with the camera. */}
              <div className="atlas-stars" aria-hidden="true">
                {stars.map((s, i) => (
                  <span
                    key={i}
                    className="atlas-star"
                    style={
                      {
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: s.r,
                        height: s.r,
                        '--tw-dur': `${s.dur}s`,
                        '--tw-delay': `${s.delay}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>

              <div
                className="atlas-world"
                data-tier={tier}
                style={
                  {
                    transform: cameraTransform(camera),
                    width: world.w,
                    height: world.h,
                    // Exposes the camera's zoom so labels can counter-scale (atlas.css) and stay a
                    // legible, constant size on screen — otherwise every name/count/badge shrinks
                    // (and blurs, since the browser is rasterizing text at a fractional CSS scale)
                    // right along with the world whenever the camera is zoomed out from 1:1, which
                    // is nearly always once more than a couple of neighborhoods exist.
                    ['--atlas-cam-scale' as string]: camera.scale,
                  } as CSSProperties
                }
              >
                {/* Cross-life connections — drawn beneath the trail; only real, recurring co-occurrences. */}
                {tier === 'galaxy' && connections.length > 0 && (
                  <svg
                    className="atlas-connections"
                    width={world.w}
                    height={world.h}
                    aria-hidden="true"
                  >
                    {connections.map((c, i) => (
                      <g key={i}>
                        <path d={c.d} fill="none" />
                        <foreignObject x={c.lx - 90} y={c.ly - 11} width="180" height="22">
                          <span className="atlas-conn-label">{c.label}</span>
                        </foreignObject>
                      </g>
                    ))}
                  </svg>
                )}

                {/* Tonight's trail */}
                {trail.length >= 1 && tier === 'galaxy' && (
                  <svg className="atlas-trail" width={world.w} height={world.h} aria-hidden="true">
                    {trail.length > 1 && (
                      <polyline
                        points={trail.map((i) => `${places[i].x},${places[i].y}`).join(' ')}
                        fill="none"
                      />
                    )}
                    {/* Keyed by trail position — the trail can revisit a neighborhood, so the
                        hood index alone duplicates. */}
                    {trail.map((i, n) => (
                      <circle key={n} cx={places[i].x} cy={places[i].y} r="5" />
                    ))}
                    <circle
                      className="atlas-trail-pulse"
                      cx={places[hereIdx].x}
                      cy={places[hereIdx].y}
                      r="5"
                    />
                  </svg>
                )}

                {/* TIER 1 — the galaxy of neighborhoods */}
                {hoods.map((h, i) => {
                  const p = places[i];
                  const newCount = h.records.filter((r) => r.savedAt > lastOpenRef.current).length;
                  const hasOpenLoop = insights.some(
                    (ins) => ins.kind === 'open-loop' && ins.hoodIndex === i,
                  );
                  const dim = tier !== 'galaxy' && i !== focusHood;
                  return (
                    <button
                      type="button"
                      key={h.id}
                      className={'atlas-hood' + (dim ? ' is-dim' : '')}
                      aria-label={`${h.name}, ${h.records.length} conversations`}
                      style={
                        {
                          left: p.x,
                          top: p.y,
                          '--hood-color': h.color,
                          '--name-size': `${15 + Math.min(9, h.records.length / 6)}px`,
                        } as CSSProperties
                      }
                      onClick={() => enterHood(i)}
                    >
                      <span className="atlas-hood-name">{h.name}</span>
                      <span className="atlas-hood-count">
                        {h.records.length} conversation{h.records.length === 1 ? '' : 's'}
                      </span>
                      {hasOpenLoop && (
                        <span className="atlas-hood-loop">
                          <span className="atlas-hood-loop-dot" aria-hidden="true" />1 open loop
                        </span>
                      )}
                      {newCount > 0 && !hasOpenLoop && (
                        <span className="atlas-hood-badge" aria-label={`${newCount} new`}>
                          {newCount} new
                        </span>
                      )}
                      <span className="atlas-hood-core" aria-hidden="true" />
                    </button>
                  );
                })}

                {/* TIER 2 — the focused neighborhood as a constellation of nights */}
                {tier !== 'galaxy' && focusedHood && focusedPlace && (
                  <div className="atlas-constellation">
                    {/* constellation links between consecutive nights */}
                    <svg
                      className="atlas-night-links"
                      width={world.w}
                      height={world.h}
                      aria-hidden="true"
                      style={{ '--hood-color': focusedHood.color } as CSSProperties}
                    >
                      {nights.slice(1).map((n, i) => (
                        <line key={i} x1={nights[i].x} y1={nights[i].y} x2={n.x} y2={n.y} />
                      ))}
                    </svg>
                    {focusedHood.records.map((r, i) => {
                      const np = nights[i] ?? { x: focusedPlace.x, y: focusedPlace.y };
                      const fresh = r.savedAt > lastOpenRef.current;
                      return (
                        <button
                          type="button"
                          key={r.id}
                          className={
                            'atlas-night' +
                            (highlightId === r.id ? ' is-found' : '') +
                            (fresh ? ' is-new' : '')
                          }
                          style={
                            {
                              left: np.x,
                              top: np.y,
                              '--hood-color': focusedHood.color,
                            } as CSSProperties
                          }
                          onClick={() => enterNight(r.id)}
                          title={`${r.question} — saved ${formatAgo(r.savedAt, now)}`}
                        >
                          <span className="atlas-night-dot" aria-hidden="true" />
                          <span className="atlas-night-card">
                            <span className="atlas-night-date">{formatAgo(r.savedAt, now)}</span>
                            <span className="atlas-night-title">{rowLabel(r, 36)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* TIER 2 chrome — synthesize, anchored to the viewport */}
              {tier === 'hood' && focusedHood && (
                <div className="atlas-hood-chrome">
                  {onGoDeeper && focusedHood.records.length >= 2 && (
                    <button
                      type="button"
                      className="atlas-hood-deeper"
                      title={`Find the common threads, lessons, and open questions across these ${focusedHood.records.length} conversations`}
                      onClick={() => onGoDeeper(deeperAsk(focusedHood.records))}
                    >
                      Synthesize →
                    </button>
                  )}
                  <span className="atlas-hood-chrome-hint">
                    {focusedHood.records.length} night{focusedHood.records.length === 1 ? '' : 's'}{' '}
                    · tap one to drop back into it
                  </span>
                </div>
              )}

              {/* Trail caption */}
              {trail.length >= 1 && tier === 'galaxy' && (
                <div className="atlas-trail-caption">
                  {trail.length > 1
                    ? `TONIGHT — ONE SESSION, ${trail.length} NEIGHBORHOODS`
                    : 'TONIGHT — YOU ARE HERE'}
                </div>
              )}

              {/* TIER 3 — the rehydrated night */}
              {tier === 'night' && nightRecord && (
                <div
                  className="atlas-night-stage"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) backOut();
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Back out of the rehydrated night"
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (e.key === ' ') e.preventDefault();
                      backOut();
                    }
                  }}
                >
                  <article
                    className="atlas-rehydrate"
                    style={
                      { '--hood-color': focusedHood?.color ?? 'var(--presence)' } as CSSProperties
                    }
                  >
                    <header className="atlas-rehydrate-head">
                      <span className="atlas-rehydrate-tag">
                        <span className="atlas-rehydrate-tag-dot" aria-hidden="true" />
                        REHYDRATED · {formatAgo(nightRecord.savedAt, now).toUpperCase()}
                        {focusedHood ? ` · ${focusedHood.name}` : ''}
                      </span>
                      <span className="atlas-rehydrate-asis">exactly as you left it</span>
                    </header>
                    <h3 className="atlas-rehydrate-title">
                      {nightRecord.title || nightRecord.question}
                    </h3>
                    <div className="atlas-rehydrate-thread">
                      <p className="atlas-rehydrate-q">{nightRecord.question}</p>
                      <div className="atlas-rehydrate-a">
                        <span className="atlas-rehydrate-orb" aria-hidden="true" />
                        <div className="atlas-rehydrate-art">
                          <span className="atlas-rehydrate-art-kind">
                            {artifactKind(nightRecord)}
                          </span>
                          <div className="atlas-rehydrate-art-body">
                            <span className="atlas-rehydrate-art-line" style={{ width: '92%' }} />
                            <span className="atlas-rehydrate-art-line" style={{ width: '76%' }} />
                            <span className="atlas-rehydrate-art-line" style={{ width: '84%' }} />
                          </div>
                          <span className="atlas-rehydrate-art-open">OPEN →</span>
                        </div>
                      </div>
                    </div>
                    <p className="atlas-rehydrate-foot">
                      This night was stored as a snapshot — nothing re-summarized. Step back inside
                      it.
                    </p>
                    <div className="atlas-rehydrate-actions">
                      <button
                        type="button"
                        className="atlas-rehydrate-land"
                        onClick={() => onLand(nightRecord)}
                      >
                        Drop back into it →
                      </button>
                      <button type="button" className="atlas-rehydrate-back" onClick={backOut}>
                        Back to the constellation
                      </button>
                    </div>
                  </article>
                </div>
              )}
            </>
          )}

          {/* "Mavéa noticed" — open loops, cross-life links, and recurring questions; real records only */}
          {tier === 'galaxy' &&
            insights.length > 0 &&
            (noticedOpen ? (
              <aside className="atlas-noticed" aria-label="What Mavéa noticed">
                <header className="atlas-noticed-head">
                  <span className="atlas-noticed-orb" aria-hidden="true" />
                  <span className="atlas-noticed-title">MAVÉA NOTICED</span>
                  <span className="atlas-noticed-sub">while you were away</span>
                  <button
                    type="button"
                    className="atlas-noticed-collapse"
                    onClick={() => setNoticedOpen(false)}
                    aria-label="Minimize what Mavéa noticed"
                    title="Minimize"
                  >
                    –
                  </button>
                </header>
                {insights.map((ins, i) => (
                  <button
                    type="button"
                    key={i}
                    className="atlas-noticed-item"
                    onClick={() => handleInsight(ins)}
                  >
                    <span
                      className="atlas-noticed-dot"
                      style={{ '--ins-color': ins.color } as CSSProperties}
                      aria-hidden="true"
                    />
                    <span className="atlas-noticed-body">
                      <span
                        className="atlas-noticed-kind"
                        style={{ '--ins-color': ins.color } as CSSProperties}
                      >
                        {ins.kindLabel}
                      </span>
                      <span className="atlas-noticed-text">{ins.text}</span>
                      <span
                        className="atlas-noticed-cta"
                        style={{ '--ins-color': ins.color } as CSSProperties}
                      >
                        {ins.cta} →
                      </span>
                    </span>
                  </button>
                ))}
              </aside>
            ) : (
              <button
                type="button"
                className="atlas-noticed-pill"
                onClick={() => setNoticedOpen(true)}
                aria-label={`Show what Mavéa noticed (${insights.length})`}
              >
                <span className="atlas-noticed-orb" aria-hidden="true" />
                <span className="atlas-noticed-pill-label">MAVÉA NOTICED</span>
                <span className="atlas-noticed-pill-count">{insights.length}</span>
              </button>
            ))}

          {/* Connection time-window switcher — scope the cross-life arcs to your whole history or
              just the recent weeks. Galaxy only, and only once there's more than a week of history to
              slice (otherwise every window is the same view). */}
          {tier === 'galaxy' && records.length > 0 && oldest < now - 7 * 86_400_000 && (
            <div
              className="atlas-range"
              role="group"
              aria-label="Connections over which time window"
            >
              <span className="atlas-range-label">CONNECTIONS OVER</span>
              {(['week', 'month', 'all'] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  className={'atlas-range-btn' + (range === r ? ' is-active' : '')}
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                >
                  {r === 'week' ? 'Last week' : r === 'month' ? 'Last month' : 'All time'}
                </button>
              ))}
            </div>
          )}

          {/* Idle hint — galaxy only */}
          {tier === 'galaxy' && records.length > 0 && (
            <div className="atlas-idle-hint">
              Click a neighborhood to fly in
              {tour.length >= 2 ? ' — or take the tour.' : '.'}
            </div>
          )}
        </div>

        <footer className="atlas-foot">
          <p className="atlas-foot-line">
            Neighborhoods grow as you talk. Fly into one to wander its nights — the atlas{' '}
            <em>is</em> the history.
          </p>
          <button type="button" className="atlas-keep" onClick={onClose}>
            Keep talking
          </button>
        </footer>
      </section>
    </div>
  );
}
