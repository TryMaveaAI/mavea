// dashboards/pin.ts — the ONE path an answer takes onto a dashboard. Both pin surfaces (the "+"
// sheet over a Live answer, Talk-to-dashboard's add) used to each hand-roll the same
// build-widget / maybe-create-board / refresh / refine sequence, and each blocked its UI on the
// refine LLM call. This helper inverts that: the pin persists immediately with the user's raw ask
// as each widget's standing refreshQuery (a worse recurring query than a refined one, but an
// honest, working one), and the refine runs ONCE in the background, upgrading the stored query
// whenever it lands. Confirming a pin is now instant, and the refine is paid at most once per
// confirmed pin instead of once per selection change.
import {
  addDashboard,
  addWidget,
  blockToWidget,
  createBlankDashboard,
  ensureFirstCheck,
  getDashboard,
  setWidgetRefreshQuery,
} from './store';
import { refreshDashboardNow } from './useDashboardLoop';
import { nextDataDue } from './cadence';
import { refineRefreshQuery } from './refineQuery';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { modelCanGenerate } from '../providers/spendPolicy';
import type { Block } from '../../data/conversation';
import type { DashSource, DataCadenceMode, Widget } from './types';

/** Where a pin lands: an existing dashboard's id, or the spec for a board created on the spot. */
export type PinTarget = string | { new: { title: string; cadence: DataCadenceMode } };

export interface PinResult {
  dashboardId: string;
  /** The board's display title, for the confirmation pill. */
  title: string;
}

/** One Talk answer can carry many blocks — cap what a single pin may flood onto a board. */
const MAX_BLOCKS_PER_PIN = 4;

/** The reasoning chrome that leads a board built from a conversation or template. A fresh pin
 *  slots in right AFTER it — visible at the top of the content, without shoving the board's own
 *  thesis/gauge header out of first place. */
const LEADING_CHROME = new Set(['thesis', 'alignmentgauge', 'standingalerts', 'sourceslineage']);

function insertIndex(widgets: Widget[]): number {
  let i = 0;
  while (i < widgets.length && LEADING_CHROME.has(widgets[i].block.type)) i += 1;
  return i;
}

/** Pin one answer's block(s) onto a dashboard — existing or created here — and return where they
 *  went, synchronously. Fires the board's first/next check right away (budget-exempt, a user
 *  action) and detaches the one refine call; `null` only when there was nothing to pin or the
 *  chosen board vanished since the picker opened (deleted in another tab). */
export function pinBlockToDashboard(opts: {
  block: Block | Block[];
  /** The ask that produced the block(s) — stored verbatim as each widget's refreshQuery so the
   *  card stays live, then upgraded in place once the background refine resolves. */
  question?: string;
  target: PinTarget;
  /** Provenance tag on the widgets themselves ('pin' | 'talk' …). */
  fromSource?: string;
  /** Lineage row recorded in the same write as the widgets (Talk keeps its "Asked: …" record). */
  source?: DashSource;
  /** Talk pins pass false: their blocks came out of a grounded turn seconds ago, so re-searching
   *  the same answer immediately would spend a call to learn nothing. */
  firstCheck?: boolean;
  now?: number;
}): PinResult | null {
  const blocks = (Array.isArray(opts.block) ? opts.block : [opts.block])
    // A "blanks" block is a form asking the USER to supply values — legitimate on a canvas, where
    // some numbers are genuinely the user's to give, but a contradiction on a dashboard, whose
    // whole premise is that values arrive from live search. One ungrounded turn auto-pinned its
    // "paste the exact prices" scaffolding onto a board as if it were trackable content; the
    // user-supplied mechanism dashboards actually support is the metric-level Blank Space, never
    // a pasted form card.
    .filter((b) => b.type !== 'blanks')
    .slice(0, MAX_BLOCKS_PER_PIN);
  if (blocks.length === 0) return null;
  const now = opts.now ?? Date.now();
  const ask = opts.question?.trim() || undefined;
  const widgets = blocks.map((b) => blockToWidget(b, opts.fromSource ?? 'pin', ask));

  let dashboardId: string;
  let title: string;
  if (typeof opts.target === 'string') {
    const existing = getDashboard(opts.target);
    if (!existing) return null;
    dashboardId = existing.id;
    title = existing.title;
    addWidget(dashboardId, widgets, {
      at: insertIndex(existing.widgets),
      ...(opts.source ? { source: opts.source } : {}),
    });
  } else {
    const dash = createBlankDashboard({ title: opts.target.new.title, question: ask, now });
    dash.cadence = { data: opts.target.new.cadence, ai: 'manual' };
    dash.nextDataAt = nextDataDue(dash.cadence, now);
    dashboardId = dash.id;
    title = dash.title;
    addDashboard(dash);
    addWidget(dashboardId, widgets, opts.source ? { source: opts.source } : {});
  }

  // A pin starts as a bare snapshot — give it a real first read now instead of leaving it frozen
  // until the next cadence tick. Never blocks the confirmation, never bills without a key
  // (refreshDashboardNow returns 'no-model' for free). ensureFirstCheck is the durable fallback
  // for that same attempt: it survives a keyless/reloaded session and fires the moment a model IS
  // connected, even on a manual-cadence board (the "new" branch above always creates one) whose
  // nextDataAt would otherwise stay parked forever.
  if (opts.firstCheck !== false) {
    ensureFirstCheck(dashboardId, now);
    void refreshDashboardNow(dashboardId);
  }

  // The one background refine: the raw ask serves until (and unless) a better standing query
  // lands. refineRefreshQuery never throws — it falls back to the raw ask itself on failure,
  // which the identity check below turns into a no-op write.
  if (ask) {
    const cfg = toModelConfig(getLiveConfigV2());
    if (modelCanGenerate(cfg)) {
      const ids = widgets.map((w) => w.id);
      void refineRefreshQuery(ask, blocks[0].type, cfg).then((refined) => {
        const q = refined.trim();
        if (q && q !== ask) setWidgetRefreshQuery(dashboardId, ids, q);
      });
    }
  }

  return { dashboardId, title };
}
