import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Source-inspection, the same route prism-briefing-pacing takes for the per-beat handler: a real
// mount of PrismOverlay needs a settled world, a laid-out camera, pdf.js and a document surface, so
// the rules that decide whether a CONTROL is offered are asserted where they are written. Every one
// of these was a control that looked live and did nothing.
const overlay = readFileSync(join(__dirname, '../src/live/prism/PrismOverlay.tsx'), 'utf8');

/** The attributes of the JSX element opened by `className="<name>"`. */
function openingTag(name: string): string {
  const match = new RegExp(`className="${name}"([\\s\\S]*?)\\n +>`).exec(overlay);
  return match?.[1] ?? '';
}

describe('Prism offers no control it cannot honour', () => {
  // The backdrop dismisses on click and that is all it is. As role="button" its Enter/Space handler
  // fired for keydowns BUBBLING out of every control inside it — Enter on a claim card or the zoom
  // knob closed the whole session instead of activating the control, and a space typed into the ask
  // box did the same — while assistive tech announced the dialog as one "Close Prism" button.
  it('gives the dismiss backdrop no button role and no keyboard handler', () => {
    const scrim = openingTag('prism-scrim');
    expect(scrim).toContain('onClick');
    expect(scrim).not.toContain('role="button"');
    expect(scrim).not.toContain('tabIndex');
    expect(scrim).not.toContain('onKeyDown');
  });

  // Every model-backed pass bails on `!corpus`, and a host can settle a world without one (the
  // walkthrough's baked map does). Ask latched to "Hide ask" over an empty stage; Check the numbers
  // and Cross-examine did nothing at all. Why and Live levers already gated correctly.
  it('gates Ask on the same context its dock renders from', () => {
    expect(overlay).toContain('disabled={!askCtx}');
  });

  it.each([
    ['Check the numbers', /onClick=\{runReconcileNow\}[\s\S]*?aria-pressed=\{reconOn\}/],
    ['Cross-examine', /onClick=\{runCrossExamNow\}[\s\S]*?aria-pressed=\{xeOpen\}/],
    ['Why \\(causes\\)', /onClick=\{openWhyLens\}[\s\S]*?title="Explode this document/],
  ])('gates %s on the grounding corpus', (_label, region) => {
    const block = region.exec(overlay)?.[0] ?? '';
    expect(block).not.toBe('');
    expect(block).toMatch(/disabled=\{[\s\S]*?!corpus/);
  });

  // Replay on an externally settled world can only be re-run by the owner that built it. Without an
  // onReplay it fell through to this component's own explode, whose state `world ?? internal`
  // discards — a button promising a re-map that changed nothing and, with a key configured, billed
  // a call nothing would read.
  it('hides Replay when nothing can actually re-map', () => {
    expect(overlay).toContain('{settled && (!world || onReplay) && (');
  });

  // explodeWhy resolves NULL on a model/network failure, so the lens spun, came back to rest, and
  // showed nothing — after spending the reader's tokens. Its siblings all report a failed pass.
  it('reports a causal trace that never ran', () => {
    const openWhy = /const openWhyLens = useCallback\(([\s\S]*?)\n {2}\}, \[/.exec(overlay)?.[1];
    expect(openWhy).toBeDefined();
    expect(openWhy).toContain('setWhyFailed(true)');
    expect(openWhy).toContain('.catch(');
    expect(overlay).toContain('Couldn’t trace the causes');
  });

  // A window listener knows nothing about what is stacked on top of it: one Escape closed the
  // legend AND the whole session, or the share-reel modal AND the session behind it.
  it('backs out of the legend, and leaves a layer above it to answer for itself', () => {
    const escape = /if \(e\.key !== 'Escape'\) return;([\s\S]*?)\n {4}\};/.exec(overlay)?.[1] ?? '';
    expect(escape).toContain('legendOpen');
    expect(escape).toContain('[role="dialog"]');
  });

  // "Silent" was true only of the tour's own flight; a briefing the reader asks for speaks by
  // default. "Computed in pure code" is true of the arithmetic and the verdict, not the pass — it
  // costs one model call, which a BYOK reader pays for.
  it('does not describe a briefing as silent or Reconcile as free', () => {
    expect(overlay).not.toMatch(/Play a silent/);
    expect(overlay).not.toMatch(/don't add up, computed in pure code/);
  });
});
