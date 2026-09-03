// AddWidgetPalette — the "+ Add" picker on the dashboard detail. Leads with "Track a number"
// (a real MetricSpec + a bound stat tile, planned by the same one-time call the Track composer
// uses), then a Note, then any dashboard-chrome widget not already present (so you can't end up
// with two alignment gauges). Honest by construction: a tracked number starts empty and fills
// from its first real search; notes and chrome fill from the dashboard's real state; nothing
// here fabricates a value. Mounted from the edit bar AND from the exported AddWidgetButton, so
// adding a card no longer requires entering layout editing first.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { addWidget, ensureFirstCheck, foldInto, MAX_METRICS, MAX_WIDGETS } from './store';
import { boardIds, confirmFailureMessage, confirmRealData } from './confirmAdd';
import { planTracker } from './planTracker';
import { getLiveConfigV2, hasModelConfigured, toModelConfig } from '../useLiveConfig';
import type { Block } from '../../data/conversation';
import type { Dashboard, MetricSpec, Widget, WidgetSpan } from './types';
import { useFocusTrap } from '../useFocusTrap';
import './dash-pin.css';

interface Addable {
  key: string;
  label: string;
  make: () => { block: Block; span: WidgetSpan };
}

function uid(): string {
  return 'w-' + Math.random().toString(36).slice(2, 8);
}

// Every block below is built fully typed against its real props interface. `col` is the canvas
// width a block would take in a Live answer — WidgetTile always re-renders a widget's block
// full-bleed (col 12) inside its own tile, so 12 is the one honest value here, not a per-type
// guess the grid would ignore anyway.
function paletteOptions(dashboard: Dashboard): Addable[] {
  const present = new Set<string>(dashboard.widgets.map((w) => w.block.type));
  const options: Addable[] = [
    {
      key: 'note',
      label: 'Note',
      make: () => ({
        block: {
          type: 'list',
          col: 12,
          id: uid(),
          props: { title: 'Note', items: ['Add a note about this dashboard.'] },
        },
        span: 2 as WidgetSpan,
      }),
    },
    {
      key: 'thesis',
      label: 'Reasoning note',
      make: () => ({
        // Chrome props are projected from the dashboard's stored state at render time (project.ts).
        block: { type: 'thesis', col: 12, id: uid(), props: { reasoning: '' } },
        span: 2 as WidgetSpan,
      }),
    },
    {
      key: 'alignmentgauge',
      label: 'Alignment gauge',
      make: () => ({
        block: { type: 'alignmentgauge', col: 12, id: uid(), props: { pct: null } },
        span: 1 as WidgetSpan,
      }),
    },
    {
      key: 'standingalerts',
      label: 'Standing alerts',
      make: () => ({
        block: { type: 'standingalerts', col: 12, id: uid(), props: { alerts: [] } },
        span: 1 as WidgetSpan,
      }),
    },
    {
      key: 'sourceslineage',
      label: 'Sources',
      make: () => ({
        block: { type: 'sourceslineage', col: 12, id: uid(), props: { rows: [] } },
        span: 2 as WidgetSpan,
      }),
    },
  ];
  return options.filter((o) => o.key === 'note' || !present.has(o.key));
}

export function AddWidgetPalette({
  dashboard,
  onClose,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}): ReactElement {
  const [view, setView] = useState<'menu' | 'track'>('menu');
  const [ask, setAsk] = useState('');
  const [planning, setPlanning] = useState(false);
  const [trackErr, setTrackErr] = useState<string | null>(null);
  const options = paletteOptions(dashboard);

  // Read once — the palette is a short-lived popover; a key can't change while it's open without
  // going through Live settings anyway.
  const hasModel = useMemo(() => hasModelConfigured(getLiveConfigV2()), []);

  const add = (o: Addable): void => {
    const { block, span } = o.make();
    const widget: Widget = { id: uid(), block, span, fromSource: 'manual' };
    addWidget(dashboard.id, widget);
    onClose();
  };

  // Closing the palette cancels an in-flight plan: the call is sunk either way, but a card
  // appearing on a board seconds after you dismissed the menu reads as haunted, not helpful.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** "Track a number": ONE planning call names the metric + its standing query (the same
   *  machinery the Track composer uses — planTracker), then the metric and a bound stat tile
   *  land in a single write, and the first real search fills it. Nothing is added when the plan
   *  finds no single number to watch — an honest refusal beats a permanently empty tile. */
  const track = async (): Promise<void> => {
    const wish = ask.trim();
    if (!wish || planning) return;
    // Capacity first, before the paid planning call: foldInto caps metrics and widgets
    // independently, so a full metric list would silently drop the new metric while keeping its
    // bound tile — a dead card that no refresh can ever fill, bought with a real model call.
    if (dashboard.metrics.length >= MAX_METRICS || dashboard.widgets.length >= MAX_WIDGETS) {
      setTrackErr('This board is full — remove a card or metric first, then track another number.');
      return;
    }
    setPlanning(true);
    setTrackErr(null);
    const plan = await planTracker(wish, toModelConfig(getLiveConfigV2()));
    if (!alive.current) return;
    const planned = plan.metrics[0];
    if (!planned) {
      setPlanning(false);
      setTrackErr(
        'No single number found in that — the Track bar on the Dashboards home builds richer trackers.',
      );
      return;
    }
    const now = Date.now();
    const metric: MetricSpec = {
      id: `m-${now}`,
      label: planned.label,
      query: planned.query,
      ...(planned.unit ? { unit: planned.unit } : {}),
      // No transcript to quote verbatim — the metric's own label stands in, the same fallback
      // the template path uses (templates/instantiate.ts).
      sourceQuote: { text: planned.label, saidAt: now },
      lastValue: null,
      origin: 'empty',
    };
    const widget: Widget = {
      id: uid(),
      block: {
        type: 'insight',
        col: 12,
        id: `blk-${now}`,
        num: '1',
        props: { title: metric.label, stat: '—', conf: 'inferred', summary: metric.label },
      },
      span: 1,
      metricId: metric.id,
      fromSource: 'manual',
    };
    const before = boardIds(dashboard);
    foldInto(dashboard.id, {
      metrics: [metric],
      tripwires: [],
      widgets: [widget],
      source: {
        kind: 'ADDED',
        conversationId: 'manual',
        title: 'Added by hand',
        contributed: `Tracking ${metric.label}`,
        at: now,
      },
    });
    // Guards the same fold-into-a-parked-board gap ensureFirstCheck exists for elsewhere: a
    // manual/no-key dashboard would otherwise never fetch this new metric until the user
    // remembers to hit Check now themselves.
    ensureFirstCheck(dashboard.id, now);
    // The add-time reality gate: the tile only stays once a grounded read confirms it returns
    // real data — an unconfirmed addition is rolled back and the bar says so honestly.
    const outcome = await confirmRealData(dashboard.id, before);
    if (!alive.current) return;
    if (outcome !== 'confirmed') {
      setPlanning(false);
      setTrackErr(confirmFailureMessage(outcome));
      return;
    }
    onClose();
  };

  const paletteRef = useRef<HTMLDivElement>(null);
  // Trap Tab/Escape to the menu items themselves; the trigger button (rendered by the parent)
  // stays outside the trap so Escape hands focus straight back to it, same as every other overlay.
  useFocusTrap(paletteRef, { onEscape: onClose });

  // Keep keyboard focus on the step being shown: the ask box when the track step opens, the
  // first item when Back returns to the menu (the Back button itself unmounts, which would
  // otherwise drop focus to the page body and out of the trap). Imperative, not the autoFocus
  // prop — same pattern the rest of this directory uses.
  const askRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (view === 'track') askRef.current?.focus();
    else paletteRef.current?.querySelector<HTMLElement>('.dash-palette-item')?.focus();
  }, [view]);

  // Close on a pointerdown outside the menu. The palette always renders as a sibling of its
  // trigger inside one positioned parent (.dash-edit-bar or .dash-add-anchor) — using THAT as the
  // boundary, rather than just the menu itself, means clicking the trigger to close the menu
  // reads as "inside" and is left to the trigger's own open/close toggle. Without this, a
  // pointerdown lands first, this listener force-closes the menu, and the SAME click's
  // bubble-phase toggle handler then flips it right back open a moment later.
  useEffect(() => {
    const root = paletteRef.current?.parentElement;
    if (!root) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!root.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  const moveFocus = (dir: 1 | -1): void => {
    const items = Array.from(
      paletteRef.current?.querySelectorAll<HTMLButtonElement>('.dash-palette-item') ?? [],
    );
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + dir + items.length) % items.length]?.focus();
  };

  return (
    <div
      ref={paletteRef}
      className="dash-palette"
      role={view === 'menu' ? 'menu' : 'dialog'}
      aria-label={view === 'menu' ? 'Add a widget' : 'Track a number'}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (view !== 'menu') return;
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      }}
    >
      {view === 'menu' ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="dash-palette-item dash-palette-lead"
            onClick={() => setView('track')}
          >
            + Track a number
          </button>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              className="dash-palette-item"
              onClick={() => add(o)}
            >
              + {o.label}
            </button>
          ))}
        </>
      ) : (
        <div className="dash-ptrack">
          <div className="dash-ptrack-head">
            <button
              type="button"
              className="dash-ptrack-back"
              aria-label="Back to widget list"
              onClick={() => setView('menu')}
            >
              ←
            </button>
            <span className="dash-ptrack-kicker">Track a number</span>
          </div>
          {hasModel ? (
            <form
              className="dash-ptrack-form"
              onSubmit={(e) => {
                e.preventDefault();
                void track();
              }}
            >
              <input
                ref={askRef}
                className="dash-ptrack-input"
                value={ask}
                placeholder="BTC price, SF temperature, 10-year yield…"
                aria-label="What number to track"
                disabled={planning}
                onChange={(e) => setAsk(e.target.value)}
              />
              {trackErr && <p className="dash-ptrack-err">{trackErr}</p>}
              <button type="submit" className="dash-ptrack-go" disabled={planning || !ask.trim()}>
                {planning ? 'Planning…' : 'Track · 1 call + 1 search'}
              </button>
            </form>
          ) : (
            <p className="dash-ptrack-gate">
              A tracked number is fetched by real web searches on your own key — nothing is ever
              made up. <a href="#/live">Connect a model in Live</a> first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Self-contained "+ Add card" trigger + palette for the detail header, so adding a card works
 *  OUTSIDE edit mode. The wrapper is the positioned parent the palette anchors to (and the
 *  boundary its outside-click close respects — see the pointerdown handler above). */
export function AddWidgetButton({ dashboard }: { dashboard: Dashboard }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="dash-add-anchor">
      <button
        type="button"
        className={'dash-edit-btn dash-add-btn' + (open ? ' is-active' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        + Add card
      </button>
      {open && <AddWidgetPalette dashboard={dashboard} onClose={() => setOpen(false)} />}
    </div>
  );
}
