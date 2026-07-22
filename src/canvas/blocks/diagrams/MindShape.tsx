// MindShape.tsx — the "Watch Me Think" canvas.
// Renders a live or settled mindshape: the atoms a person voiced and the tension threads
// between what pulls against what — organized around the EMERGENT themes the model named from
// their own words (no pre-printed category lanes, no model-supplied coordinates). Before any
// theme exists (live, or an older block with no clusters) atoms simply orbit the listening
// face. The settled block view is identical to the live view so replay and library are
// pixel-identical to the moment of capture.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Presence } from '../../../presence/Presence';
import { useSpatialCanvas } from '../../spatial/useSpatialCanvas';
import './mindshape-world.css';
import type {
  MindAtom,
  MindAtomKind,
  MindIntent,
  MindLink,
  MindShapeSpec,
  MindSignal,
  MindUnsaid,
} from '../../../live/mindshape/types';
import {
  CARD_HH,
  CARD_HW,
  computeLayout,
  CX,
  CY,
  KEEPOUT,
  MARGIN,
  VH,
  VW,
  type MindShapePoint,
} from './mindShapeLayout';

export type MindPhase = 'idle' | 'listening' | 'pausing' | 'settled';
// 'plan' opens the in-canvas traced-step checklist; 'commit-plan' runs it as a real turn.
// 'tell-apart' fires a focused turn on a specific tension ("help me tell them apart").
// 'keep' shows the "kept this shape" panel; 'share'/'present' route from there.
export type MindAction =
  | 'answer'
  | 'plan'
  | 'commit-plan'
  | 'tell-apart'
  | 'add-more'
  | 'not-quite'
  | 'keep'
  | 'share'
  | 'present';

/** Optional focus passed alongside a {@link MindAction}. */
export interface MindActionDetail {
  /** For 'tell-apart': the two sides of the tension being separated, in the person's own words. */
  tension?: { a: string; b: string };
}

export interface MindShapeProps extends Partial<MindShapeSpec> {
  center: string;
  atoms: MindAtom[];
  links: MindLink[];
  phase?: MindPhase;
  /** Detected session intent — drives adaptive center label and action button copy. */
  intent?: MindIntent;
  /** Whether the 1.8s settle reveal sequence is currently playing. Gates cascade animations. */
  isRevealing?: boolean;
  /** Current transient signal chip — Mavéa noticing a pattern during listening. */
  currentSignal?: MindSignal | null;
  /** Post-settle action. `detail` carries the focus for actions that target a specific thing —
   *  'tell-apart' passes the tension's two atom labels so the turn can be scoped to it. */
  onAction?: (action: MindAction, detail?: MindActionDetail) => void;
  /** Live only: called when the user dismisses a card (the ✕). Absent in block/replay mode, which
   *  keeps the map read-only. */
  onRemoveAtom?: (id: string) => void;
  /** Live only: user confirmed the unsaid observation ("yes, that's it"). */
  onConfirmUnsaid?: () => void;
  /** Live only: user dismissed the unsaid card ("not quite"). */
  onDismissUnsaid?: () => void;
  /** Interim speech text from the VAD — shown as a live ticker so user knows mic is active. */
  liveTranscript?: string;
  /** Number of distinct thoughts heard so far — shown under the face as a count. */
  thoughtCount?: number;
  delay?: number;
  /** false = no .card.reveal wrapper (live canvas mode). Default true (block mode). */
  asBlock?: boolean;
}

// ── Coordinate system ────────────────────────────────────────────────────────
// Fixed 1000×700 SVG space; container uses aspect-ratio: 10/7 so 1 SVG unit = 1px
// at ~640px container width. Both axes scale uniformly — circles stay circles, the
// perpendicular-offset beziers for tension threads look correct.
// ── Kind palette ─────────────────────────────────────────────────────────────
const KIND_COLOR: Record<MindAtomKind, string> = {
  person: '#2E9C8E',
  option: '#5B63E8',
  want: '#B07A2E',
  fear: '#C9705E',
  constraint: '#7A8194',
  tradeoff: '#8B6FD4',
  contradiction: '#C9705E',
  open_loop: '#C98A1B',
  action: '#5B63E8',
  value: '#B07A2E',
  question: '#C98A1B',
};

const KIND_LABEL: Record<MindAtomKind, string> = {
  person: 'Person',
  option: 'Option',
  want: 'Want',
  fear: 'Worry',
  constraint: 'Constraint',
  tradeoff: 'Tradeoff',
  contradiction: 'Contradiction',
  open_loop: 'Open loop',
  action: 'Action',
  value: 'Value',
  question: 'Question',
};

/** Quadratic Bézier tension arc between two atoms. Perpendicular control-point offset
 *  keeps the curve visually clear from a straight spoke. Returns the SVG `d` attribute
 *  and the midpoint label position (slightly outward from the curve apex). */
function tensionArc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { d: string; lx: number; ly: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // perpendicular (right-hand of a→b)
  const py = dx / len;
  const OFFSET = 52;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cpx = mx + px * OFFSET;
  const cpy = my + py * OFFSET;
  // Midpoint of the quadratic at t=0.5, pushed slightly outward for the label
  const lx = 0.25 * x1 + 0.5 * cpx + 0.25 * x2 + px * 18;
  const ly = 0.25 * y1 + 0.5 * cpy + 0.25 * y2 + py * 18;
  return { d: `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`, lx, ly };
}

// ── Atom card ─────────────────────────────────────────────────────────────────
function AtomCard({
  atom,
  x,
  y,
  order,
  onRemove,
}: {
  atom: MindAtom;
  x: number;
  y: number;
  order: number;
  onRemove?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = KIND_COLOR[atom.kind] ?? '#7A8194';
  const isStable = atom.status === 'stable';

  return (
    <div
      className="ms-card"
      data-status={atom.status}
      data-open={open ? 'true' : undefined}
      style={
        {
          left: `${x}px`,
          top: `${y}px`,
          ['--ms-kind-color' as string]: color,
          ['--ms-i' as string]: order,
        } as CSSProperties
      }
      onClick={() => isStable && setOpen((v) => !v)}
      role={isStable ? 'button' : undefined}
      tabIndex={isStable ? 0 : undefined}
      aria-expanded={isStable ? open : undefined}
      onKeyDown={(e) => e.key === 'Enter' && isStable && setOpen((v) => !v)}
    >
      {onRemove && (
        <button
          type="button"
          className="ms-card-remove"
          aria-label={`Remove “${atom.label}”`}
          // Stop the click bubbling so dismissing a card never also toggles its quote open.
          onClick={(e) => {
            e.stopPropagation();
            onRemove(atom.id);
          }}
        >
          ×
        </button>
      )}
      <div className="ms-card-header">
        <span className="ms-kind-dot" aria-hidden="true" />
        <span className="ms-kind-label">{KIND_LABEL[atom.kind]}</span>
      </div>
      <div className="ms-atom-label">{atom.label}</div>
      {isStable && (
        <div className="ms-card-quote" aria-hidden={!open}>
          <span className="ms-you-said">you said · </span>
          {atom.quote}
        </div>
      )}
    </div>
  );
}

// ── Unsaid card ───────────────────────────────────────────────────────────────
function UnsaidCard({
  unsaid,
  onConfirm,
  onDismiss,
}: {
  unsaid: MindUnsaid;
  onConfirm?: () => void;
  onDismiss?: () => void;
}) {
  const interactive = !!(onConfirm || onDismiss);
  return (
    <div
      className="ms-card ms-unsaid"
      data-status="maybe"
      data-interactive={interactive ? 'true' : undefined}
      style={{ left: '72%', top: '88%', ['--ms-i' as string]: 20 } as CSSProperties}
      aria-label={`Maybe: ${unsaid.label}`}
    >
      <div className="ms-card-header">
        <span className="ms-kind-dot" style={{ background: 'var(--warning)' }} aria-hidden="true" />
        <span className="ms-kind-label" style={{ color: 'var(--warning)' }}>
          Maybe
        </span>
      </div>
      <div className="ms-atom-label">{unsaid.label}</div>
      <div className="ms-card-quote">{unsaid.why}</div>
      {interactive && (
        <div className="ms-unsaid-actions">
          {onConfirm && (
            <button
              type="button"
              className="ms-unsaid-btn ms-unsaid-confirm"
              onClick={(e) => {
                e.stopPropagation();
                onConfirm();
              }}
            >
              Yes, that's it
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="ms-unsaid-btn ms-unsaid-dismiss"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              Not this
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Signal chip ────────────────────────────────────────────────────────────────
// A transient Mavéa reaction shown above the center face during listening — the signal that
// something was noticed. Silent, auto-dismissed, one at a time, never in the settled phase.
function SignalChip({ signal }: { signal: { id: string; content: string; kind: string } }) {
  return (
    <div className="ms-signal-chip" data-kind={signal.kind} key={signal.id} aria-live="polite">
      {signal.content}
    </div>
  );
}

// ── Synthesis line ─────────────────────────────────────────────────────────────
// One-line summary that fades in during the settle reveal, before the action bar appears.
// Pure client-side from the spec — no model call.
function synthesisLine(
  spec: { atoms: { kind: string }[]; links: { kind: string }[] },
  heroTension: { a: { label: string }; b: { label: string } } | null,
): string {
  const tensions = spec.links.filter((l) => l.kind === 'tensions').length;
  const questions = spec.atoms.filter((a) => a.kind === 'question').length;
  const options = spec.atoms.filter((a) => a.kind === 'option').length;
  const total = spec.atoms.length;
  if (heroTension && tensions > 0) {
    const label =
      tensions === 1
        ? `1 tension. ${heroTension.a.label} vs ${heroTension.b.label}.`
        : `${tensions} tensions. The real pull: ${heroTension.a.label} vs ${heroTension.b.label}.`;
    return label;
  }
  if (questions >= 3) return `${questions} open questions.`;
  if (options >= 2) return `${options} options. ${total} things on your mind.`;
  return `${total} thought${total === 1 ? '' : 's'}. Here's what I heard.`;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function MindShape({
  center,
  atoms = [],
  links = [],
  clusters,
  unsaid,
  title,
  phase = 'settled',
  intent = 'general',
  isRevealing = false,
  currentSignal,
  onAction,
  onRemoveAtom,
  onConfirmUnsaid,
  onDismissUnsaid,
  liveTranscript,
  thoughtCount,
  delay = 0,
  asBlock = true,
}: MindShapeProps) {
  // Carry each frame's positions forward so an existing card keeps its spot when a new atom lands
  // (append-stable — see computeLayout's `prev`). Reset the seed whenever the grouping changes, so a
  // theme forming is still free to reorganise the map instead of freezing cards in their old places.
  const prevPositionsRef = useRef<Map<string, MindShapePoint>>(new Map());
  const clusterKey = (clusters ?? []).map((c) => `${c.id}:${c.atomIds.join(',')}`).join('|');
  const prevClusterKeyRef = useRef<string>('');
  const seed = clusterKey === prevClusterKeyRef.current ? prevPositionsRef.current : undefined;
  const { positions, centroidOf, labels } = useMemo(
    () => computeLayout(atoms, clusters, seed),
    // seed is derived from clusters (via clusterKey), so it needs no separate dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atoms, clusters],
  );
  prevPositionsRef.current = positions;
  prevClusterKeyRef.current = clusterKey;

  // Auto-fit camera: frame the atoms' real bounding box, so the map zooms to FILL the canvas (using
  // the full width of the 10:7 stage, not a centred square that wastes the sides). The counter-scale
  // (mindshape-world.css) keeps the cards readable as it zooms out, so the floor can stay low.
  const sc = useSpatialCanvas({ clamp: { min: 0.12, max: 1.05 }, margin: 20 });
  // fitTo is a stable useCallback; depend on it directly so the re-fit effect below has an
  // exhaustive, lint-clean dependency list (the whole `sc` object would over-trigger).
  const { fitTo } = sc;
  const fitBbox = useMemo(() => {
    // Real bounding box of every card (each ± its half-extent), symmetrized around the face so it
    // stays centred. Using the actual width/height — not a square — lets the camera fill the wide
    // 10:7 stage instead of leaving the sides empty.
    let halfW = CARD_HW + KEEPOUT;
    let halfH = CARD_HH + KEEPOUT * 0.7;
    for (const p of positions.values()) {
      halfW = Math.max(halfW, Math.abs(p.x - CX) + CARD_HW);
      halfH = Math.max(halfH, Math.abs(p.y - CY) + CARD_HH);
    }
    if (unsaid) {
      halfW = Math.max(halfW, Math.abs(0.72 * VW - CX) + CARD_HW);
      halfH = Math.max(halfH, Math.abs(0.88 * VH - CY) + CARD_HH);
    }
    halfW += MARGIN;
    halfH += MARGIN;
    return { x: CX - halfW, y: CY - halfH, w: 2 * halfW, h: 2 * halfH };
  }, [positions, unsaid]);
  useEffect(() => {
    fitTo(fitBbox);
  }, [fitBbox, fitTo]);

  // Draw tensions last so the hero arcs sit on top of the quieter supports/depends-on threads.
  const orderedLinks = [...links].sort(
    (a, b) => (a.kind === 'tensions' ? 1 : 0) - (b.kind === 'tensions' ? 1 : 0),
  );

  const byId = useMemo(() => new Map(atoms.map((a) => [a.id, a])), [atoms]);

  // The hero tension — the model-named conflict the map is really about (not a client-guessed
  // "possible tension?"). The settled "tension callout" explains it in the person's own words and
  // offers to help tell the two apart. Picked by salience: the most central pair, ties broken
  // deterministically by id so the same map always surfaces the same one.
  const heroTension = useMemo(() => {
    const real = links.filter((l) => l.kind === 'tensions' && !l.provisional && l.label);
    if (real.length === 0) return null;
    const weightOf = (id: string): number => byId.get(id)?.weight ?? 1;
    const best = real
      .map((l) => ({ l, w: weightOf(l.from) + weightOf(l.to) }))
      .sort((x, y) => y.w - x.w || (x.l.from + x.l.to).localeCompare(y.l.from + y.l.to))[0];
    const a = byId.get(best.l.from);
    const b = byId.get(best.l.to);
    if (!a || !b) return null;
    return { a, b, label: best.l.label as string };
  }, [links, byId]);

  // The open loops + actions, as the steps of a plan the person controls. Each step traces back to a
  // verbatim quote — nothing invented (the canvas's whole contract). Steps that carry no quote are
  // dropped so the "traces back to something you said" footer is always honestly true.
  // The plan is the things you can act on or pursue: open loops + actions for a decision you're
  // weighing, and the open questions for a subject you're exploring (so a questions-only map — "what
  // about India" — still turns into a plan of what to look into, not an empty panel).
  const planSteps = useMemo(
    () =>
      atoms
        .filter(
          (a) =>
            (a.kind === 'open_loop' || a.kind === 'action' || a.kind === 'question') &&
            a.quote &&
            a.status !== 'maybe',
        )
        .map((a) => ({ id: a.id, label: a.label, quote: a.quote })),
    [atoms],
  );

  // Which settled sub-view is open: the tension callout, the plan checklist, or the "kept" panel.
  // null = just the map. Only one at a time; opening one closes the others.
  const [panel, setPanel] = useState<'tension' | 'plan' | 'kept' | null>(null);
  // Steps the user has checked off in the plan — it's a checklist they control, so the boxes are real.
  const [doneSteps, setDoneSteps] = useState<ReadonlySet<string>>(() => new Set());
  const toggleStep = useCallback((id: string) => {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Auto-open the relevant panel once when a thinking session settles:
  //   - decision intent (or any intent with a hero tension) → tension callout
  //   - planning intent → plan checklist (the primary next step when you've been listing actions)
  // Only one auto-opens; they're guarded by refs that clear when a new session begins.
  const tensionSeenRef = useRef(false);
  const planAutoOpenedRef = useRef(false);
  const wasSettledRef = useRef(phase === 'settled');
  useEffect(() => {
    if (phase === 'settled') {
      if (intent === 'planning' && !planAutoOpenedRef.current) {
        planAutoOpenedRef.current = true;
        setPanel('plan');
      } else if (heroTension && !tensionSeenRef.current && intent !== 'planning') {
        tensionSeenRef.current = true;
        setPanel('tension');
      }
    }
    // Clear panels only when a NEW thinking session begins (settled → live again).
    const wasSettled = wasSettledRef.current;
    wasSettledRef.current = phase === 'settled';
    if (wasSettled && phase !== 'settled') {
      tensionSeenRef.current = false;
      planAutoOpenedRef.current = false;
      setPanel(null);
    }
  }, [phase, heroTension, intent]);
  const presenceState =
    phase === 'listening' ? 'listening' : phase === 'pausing' ? 'thinking' : 'idle';

  // Intent-aware settled center label — what kind of thinking this turned out to be.
  const settledCenterLabel =
    phase === 'settled'
      ? ({
          decision: 'THE DECISION',
          planning: 'THE PLAN',
          exploration: 'THE QUESTION',
          processing: "WHAT'S GOING ON",
          general: 'WHAT I HEARD',
        }[intent] ?? 'WHAT I HEARD')
      : "WHAT I'M HEARING";

  // Intent-aware primary action label — same underlying action, more specific copy.
  const primaryActionLabel =
    {
      decision: 'Help me decide',
      planning: 'Build this plan',
      exploration: 'Take me deeper',
      processing: 'Help me understand',
      general: 'Answer this',
    }[intent] ?? 'Answer this';

  const canvas = (
    <div
      className="ms-canvas"
      ref={sc.viewportRef}
      // The camera scale also has to reach the CENTER block, which is a fixed sibling of the world
      // rather than a child of it — so it could not read a variable set on .ms-world. Without it the
      // centre text stayed full size while the map zoomed out beneath it, and the question ended up
      // lying across the atom cards. Publish the scale on the shared parent so both can see it.
      style={{ ['--ms-cam-scale' as string]: sc.camera.scale } as CSSProperties}
      data-phase={phase}
      data-revealing={isRevealing ? 'true' : undefined}
      data-has-actions={onAction && atoms.length > 0 ? 'true' : undefined}
      role="region"
      aria-label="Mindshape — the shape of your thought"
    >
      {/* The world layer the camera flies. The face + action bar are fixed siblings OUTSIDE it —
          the camera's scale must never land on a .presence ancestor, and the face is the still
          point the map arranges around. */}
      <div
        className="ms-world"
        style={
          {
            transform: sc.transform,
            // Expose the camera scale so cards can counter-scale and stay readable when a sparse map
            // (or a far-flung "maybe" card) makes the camera zoom way out.
            ['--ms-cam-scale' as string]: sc.camera.scale,
          } as CSSProperties
        }
      >
        {/* ── Emergent theme labels — only the themes the person actually raised, in their own
            words. None appear until a theme has been named, so there is no pre-printed scaffold. ── */}
        {labels.map((tl) => (
          <div
            key={tl.id}
            className="ms-cluster-label"
            style={{ left: `${tl.x}px`, top: `${tl.y}px` } as CSSProperties}
            aria-hidden="true"
          >
            {tl.label}
          </div>
        ))}

        {/* ── SVG layer: spokes + connection threads ─────────────────────── */}
        <svg className="ms-svg" viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
          {/* Spokes: faint lines tethering each stable atom to its theme centroid */}
          {atoms
            .filter((a) => a.status === 'stable')
            .map((a, i) => {
              const p = positions.get(a.id);
              const c = centroidOf.get(a.id);
              if (!p || !c) return null;
              return (
                <path
                  key={`spoke-${a.id}`}
                  className="ms-spoke"
                  d={`M ${c.x} ${c.y} L ${p.x} ${p.y}`}
                  pathLength={1}
                  style={{ ['--ms-spoke-i' as string]: i } as CSSProperties}
                />
              );
            })}

          {/* Connection threads: curved arcs between related atoms. Tensions are the hero (bold,
            colored, dashed, labelled); supports/depends-on/same-thread render as quieter threads so
            the map's structure is visible even when nothing is in conflict (e.g. a sequential plan).
            The highest-weight tension gets data-hero="true" so the settle reveal can draw it in. */}
          {orderedLinks.map((link, i) => {
            const from = positions.get(link.from);
            const to = positions.get(link.to);
            if (!from || !to) return null;
            const isTension = link.kind === 'tensions';
            const fromColor = KIND_COLOR[byId.get(link.from)?.kind ?? 'fear'];
            const { d, lx, ly } = tensionArc(from.x, from.y, to.x, to.y);
            const isHero =
              isTension &&
              heroTension &&
              link.from === heroTension.a.id &&
              link.to === heroTension.b.id;
            return (
              <g key={`link-${link.from}-${link.to}-${link.kind}`}>
                <path
                  className={isTension ? 'ms-thread' : 'ms-link'}
                  data-kind={link.kind}
                  data-hero={isHero ? 'true' : undefined}
                  d={d}
                  pathLength={isTension ? 1 : undefined}
                  stroke={isTension ? fromColor : undefined}
                  style={{ animationDelay: `${0.3 + i * 0.12}s` } as CSSProperties}
                />
                {isTension && link.label && (
                  <text
                    className="ms-thread-label"
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {link.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Atom cards ──────────────────────────────────────────────── */}
        {atoms.map((atom, i) => {
          const p = positions.get(atom.id);
          if (!p) return null;
          return (
            <AtomCard key={atom.id} atom={atom} x={p.x} y={p.y} order={i} onRemove={onRemoveAtom} />
          );
        })}

        {/* ── Unsaid card — the one thing they kept circling but never said. Shown whenever the model
            surfaced it (it rides along live, not just at the end). Interactive in live mode:
            "Yes, that's it" promotes it to a real atom; "Not quite" dismisses it. ─────── */}
        {unsaid && (
          <UnsaidCard unsaid={unsaid} onConfirm={onConfirmUnsaid} onDismiss={onDismissUnsaid} />
        )}
      </div>
      {/* end .ms-world */}

      {/* ── Center node: Pip face — a fixed sibling the world flies around (never transformed) ── */}
      <div className="ms-center">
        {/* Signal chip: transient Mavéa reaction above the face during listening */}
        {currentSignal && phase !== 'settled' && <SignalChip signal={currentSignal} />}
        <div className="ms-center-pip-wrap">
          <Presence state={presenceState} emotion="neutral" gaze="center" />
        </div>
        <div className="ms-center-label" aria-hidden="true">
          {settledCenterLabel}
        </div>
        {center && (
          <div className="ms-center-question" aria-live="polite">
            {center}
          </div>
        )}
        {/* Synthesis line: fades in during the settle reveal — one sentence of what was found.
            A very short turn can settle with nothing to map; say so honestly rather than
            leaving a bare face with no explanation and no way forward but the exit button. */}
        {phase === 'settled' &&
          (atoms.length > 0 ? (
            <div className="ms-synthesis-line" aria-live="polite">
              {synthesisLine({ atoms, links }, heroTension)}
            </div>
          ) : (
            <div className="ms-synthesis-line" aria-live="polite">
              Didn't catch enough to map yet — keep talking and I'll shape it.
            </div>
          ))}
        {/* Thought count + pulsing mic dot — confirms voice is registering. Counts what's ON THE MAP
            (the atoms) once any exist, falling back to the spoken-thought count while still listening:
            a short prompt the model expands into several atoms must read as "N thoughts", not "1". */}
        {thoughtCount !== undefined && thoughtCount >= 0 && phase !== 'settled' && (
          <div className="ms-thought-count" aria-live="polite">
            <span className="ms-mic-dot" aria-hidden="true" />
            {(() => {
              const n = Math.max(thoughtCount, atoms.length);
              return n === 0 ? 'Listening…' : `${n} thought${n === 1 ? '' : 's'}`;
            })()}
          </div>
        )}
        {/* Live speech ticker — shows the current spoken words as they arrive */}
        {liveTranscript && (
          <div className="ms-live-text" aria-live="polite" aria-label="Currently hearing">
            {liveTranscript}
          </div>
        )}
      </div>

      {/* ── The tension callout — the headline of the settled map ──────────────
          When the model found a real conflict, name it in the person's own words and offer to help
          tell the two reasons apart. Auto-opens once; dismissable; re-openable from the action bar. */}
      {phase === 'settled' && heroTension && panel === 'tension' && (
        <div className="ms-tension-callout" role="dialog" aria-label="The tension">
          <button
            type="button"
            className="ms-tension-close"
            aria-label="Dismiss"
            onClick={() => setPanel(null)}
          >
            ×
          </button>
          <span className="ms-tension-eyebrow">THE TENSION</span>
          <p className="ms-tension-body">
            You keep coming back to <strong>“{heroTension.a.label}.”</strong> But you also said{' '}
            <strong>“{heroTension.b.label}.”</strong> Those may not be the same reason.
          </p>
          {onAction && (
            <button
              type="button"
              className="ms-tension-cta"
              onClick={() =>
                onAction('tell-apart', {
                  tension: { a: heroTension.a.label, b: heroTension.b.label },
                })
              }
            >
              Help me tell them apart →
            </button>
          )}
        </div>
      )}

      {/* ── Turn into a plan — the open loops, as steps you control ──────────────
          Each step traces to a verbatim quote, so the footer's promise ("nothing invented") is true
          by construction. "Make it real" runs the plan as an actual turn. */}
      {panel === 'plan' && (
        <div className="ms-plan" role="dialog" aria-label="Turn into a plan">
          <header className="ms-plan-head">
            <span className="ms-plan-title">The open loops, as steps you control</span>
            <button
              type="button"
              className="ms-tension-close"
              aria-label="Close the plan"
              onClick={() => setPanel(null)}
            >
              ×
            </button>
          </header>
          {planSteps.length > 0 ? (
            <ol className="ms-plan-steps">
              {planSteps.map((s) => {
                const done = doneSteps.has(s.id);
                return (
                  <li key={s.id} className="ms-plan-step" data-done={done ? 'true' : undefined}>
                    <button
                      type="button"
                      className="ms-plan-check"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={`Mark “${s.label}” done`}
                      onClick={() => toggleStep(s.id)}
                    >
                      {done && (
                        <span className="ms-plan-check-mark" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                    <span className="ms-plan-step-body">
                      <span className="ms-plan-step-label">{s.label}</span>
                      <span className="ms-plan-step-trace">from “{s.quote}”</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="ms-plan-empty">
              No open loops to turn into steps yet — keep talking and they’ll surface.
            </p>
          )}
          <footer className="ms-plan-foot">
            <span className="ms-plan-note">
              Every step traces back to something you said — nothing invented.
            </span>
            {onAction && planSteps.length > 0 && (
              <button
                type="button"
                className="ms-action-btn ms-action-primary"
                onClick={() => onAction('commit-plan')}
              >
                Make it real →
              </button>
            )}
          </footer>
        </div>
      )}

      {/* ── Kept this shape — the calm close. Replay / Share / Present, and the memory reassurance. ── */}
      {phase === 'settled' && panel === 'kept' && (
        <div className="ms-kept" role="dialog" aria-label="Kept this shape">
          <button
            type="button"
            className="ms-tension-close"
            aria-label="Close"
            onClick={() => setPanel(null)}
          >
            ×
          </button>
          <span className="ms-kept-eyebrow">KEPT THIS SHAPE</span>
          <p className="ms-kept-body">
            This is the shape of what you were thinking. It’s yours to revisit.
          </p>
          {onAction && (
            <div className="ms-kept-actions">
              <button type="button" className="ms-kept-btn" onClick={() => onAction('answer')}>
                ↻ Replay
              </button>
              <button type="button" className="ms-kept-btn" onClick={() => onAction('share')}>
                ↗ Share
              </button>
              <button type="button" className="ms-kept-btn" onClick={() => onAction('present')}>
                ▶ Present mode
              </button>
            </div>
          )}
          <span className="ms-kept-memory">
            Nothing was saved to memory — Mavéa asks first before keeping anything personal.
          </span>
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────────────── */}
      {/* Live on the map as soon as there's something to act on — no pause or timer.
          Primary action label is intent-aware (same action, copy that fits what was said).
          "Turn into a plan" opens the traced-step checklist in place; "That's it" keeps the
          shape (Replay/Share/Present); "Add more" keeps the map and resumes listening ("I forgot
          a few things" — settled only, since live listening is already adding as you talk);
          "Not quite" clears it. */}
      {onAction && atoms.length > 0 && (
        <div className="ms-actions" role="group" aria-label="What to do with this map">
          <button
            type="button"
            className="ms-action-btn ms-action-primary"
            onClick={() => onAction('answer')}
          >
            {primaryActionLabel}
          </button>
          <button
            type="button"
            className={'ms-action-btn' + (panel === 'plan' ? ' is-active' : '')}
            aria-pressed={panel === 'plan'}
            onClick={() => setPanel((p) => (p === 'plan' ? null : 'plan'))}
          >
            Turn into a plan
          </button>
          {phase === 'settled' && (
            <button
              type="button"
              className={'ms-action-btn' + (panel === 'kept' ? ' is-active' : '')}
              aria-pressed={panel === 'kept'}
              onClick={() => setPanel((p) => (p === 'kept' ? null : 'kept'))}
            >
              That’s it
            </button>
          )}
          {phase === 'settled' && (
            <button type="button" className="ms-action-btn" onClick={() => onAction('add-more')}>
              Add more
            </button>
          )}
          <button type="button" className="ms-action-btn" onClick={() => onAction('not-quite')}>
            Not quite
          </button>
        </div>
      )}
    </div>
  );

  if (!asBlock) return canvas;

  return (
    <div className="card reveal" style={{ ['--delay' as string]: `${delay}ms` } as CSSProperties}>
      {title && <div className="card-eyebrow">{title}</div>}
      {canvas}
    </div>
  );
}
