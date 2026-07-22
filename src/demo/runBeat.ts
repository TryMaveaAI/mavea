// runBeat.ts — how each DemoBeat performs on the real surface: one beat kind, one small
// choreography over the TourOps closures LiveApp exposes (the same ones the walkthrough
// drives). Pacing mirrors the tour's hand-tuned delays for the same gestures, so a feature
// feels the same whether a chapter or a demo shows it.
import type { TourOps } from '../tour/useTourDriver';
import type { StepTimers } from '../tour/driverKit';
import type { TurnFrame } from '../live/history';
import type { DemoBeat } from './beats';

/** Camera-glide pacing for the focus/canvas card walks (per card, ms). */
const FLY_STEP_MS = 1300;
const FLY_SETTLE_MS = 900;

function blockIds(frame: TurnFrame | null, cap: number): string[] {
  return (frame?.spec.blocks ?? [])
    .map((b) => b.id)
    .filter((id): id is string => !!id)
    .slice(0, cap);
}

/** Schedule one beat's calls. `frame` is the canvas the beat decorates — used to walk real
 *  card ids and to guard beats that need canvas features (a bend beat without a bend on the
 *  frame is skipped, never mimed). */
export function runBeat(
  b: DemoBeat,
  o: TourOps,
  frame: TurnFrame | null,
  after: StepTimers['after'],
): void {
  switch (b.kind) {
    case 'pin':
      after(b.atMs, () => o.pinFirstBlock());
      break;
    case 'bend':
      // Only when the baked frame really carries a bend — the dial must exist to be dragged.
      if (frame?.spec.bend) after(b.atMs, () => o.bendIt());
      break;
    case 'mark':
      after(b.atMs, () => o.setInkArmed(true));
      after(b.atMs + 500, () => o.scriptedMark());
      break;
    case 'pen':
      after(b.atMs, () => o.drawPenOnFirstBlock());
      break;
    case 'focus': {
      after(b.atMs, () => o.setViewMode('focus'));
      if (b.walk) {
        const ids = blockIds(frame, 4);
        ids.forEach((id, i) =>
          after(b.atMs + FLY_SETTLE_MS + i * FLY_STEP_MS, () => o.setSpot(id)),
        );
      }
      break;
    }
    case 'canvas': {
      after(b.atMs, () => o.setViewMode('canvas'));
      // Fly the camera card to card, then release so the step closes on the full board.
      const ids = blockIds(frame, 3);
      ids.forEach((id, i) => after(b.atMs + FLY_SETTLE_MS + i * FLY_STEP_MS, () => o.setSpot(id)));
      after(b.atMs + FLY_SETTLE_MS + ids.length * FLY_STEP_MS, () => o.setSpot(null));
      break;
    }
    case 'export':
      after(b.atMs, () => o.openExport());
      if (b.format === 'document') after(b.atMs + 1800, () => o.exportSetFormat('document'));
      after(b.atMs + 3000, () => o.exportPickTemplate(1));
      break;
    case 'dashboard':
      after(b.atMs, () => o.openDashboards());
      if (b.settings) after(b.atMs + 2600, () => o.dashboardShowSettings());
      break;
    case 'flashcards':
      after(b.atMs, () => o.openFlashcards());
      break;
    case 'present':
      after(b.atMs, () => o.setPresenting(true));
      break;
    case 'share':
      after(b.atMs, () => o.setShareOpen(true));
      break;
    case 'palette':
      after(b.atMs, () => o.setPaletteOpen(true));
      break;
  }
}

/** How long a beat's choreography runs past its atMs — used to size the step's hold so the
 *  auto-advance never cuts a flight or an overlay short. Estimates on the generous side. */
export function beatDurationMs(b: DemoBeat): number {
  switch (b.kind) {
    case 'canvas':
      return FLY_SETTLE_MS + 3 * FLY_STEP_MS + 1600;
    case 'focus':
      return b.walk ? FLY_SETTLE_MS + 4 * FLY_STEP_MS + 1200 : 1600;
    case 'export':
      return b.format === 'document' ? 4800 : 3800;
    case 'dashboard':
      return b.settings ? 4400 : 2600;
    case 'mark':
      return 2400;
    case 'pen':
      return 3200;
    default:
      return 1600;
  }
}

/** The latest moment (from walk-quiet) a step's beats are still performing. */
export function beatsEndMs(beats: readonly DemoBeat[] | undefined): number {
  if (!beats?.length) return 0;
  return Math.max(...beats.map((b) => b.atMs + beatDurationMs(b)));
}
