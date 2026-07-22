// The reveal walk's readiness barrier + audio-gated pacing carry ordering invariants that keep
// mute / barge-in / dismissal instant even while the walk is awaiting real signals. Like the
// muted-instant-reveal guard, these can't be proven by mounting LiveApp (the walk effect needs
// a landed turn, live audio handles, and the annotation DOM), so the wiring is pinned by
// inspecting the source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('the reveal walk barrier keeps its escape hatches armed', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
  const effectStart = src.indexOf("// Reveal tour: when a turn's canvas lands");
  const effectEnd = src.indexOf('}, [turn.turn]);', effectStart);

  it('finds the reveal-tour effect', () => {
    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);
  });

  const effect = src.slice(effectStart, effectEnd);

  it('assigns the flush hatch synchronously BEFORE the barrier starts awaiting', () => {
    // A mute (or Escape) during the barrier reaches the walk only through flushWalkRef — if it
    // were assigned after the first await, muting during a cold-voice wait would do nothing and
    // a voiced walk would start over a muted canvas.
    const flushAssign = effect.indexOf('flushWalkRef.current = () => {');
    const barrierStart = effect.indexOf('void beginWalk()');
    expect(flushAssign).toBeGreaterThan(-1);
    expect(barrierStart).toBeGreaterThan(flushAssign);
  });

  it('holds walkActive across the whole barrier so tour/demo quiet-gates stay honest', () => {
    // walkActive must flip true before beginWalk is even defined — the demo driver's
    // quiet-watch (1s grace) reads isBusy() during the barrier window.
    const walkActiveSet = effect.indexOf('walkActive.current = true;');
    const beginWalkDef = effect.indexOf('const beginWalk');
    expect(walkActiveSet).toBeGreaterThan(-1);
    expect(beginWalkDef).toBeGreaterThan(walkActiveSet);
  });

  it('re-checks the bail flags after the barrier and between every audio wait', () => {
    // One bail() per await keeps a flush/dismiss during ANY wait from touching the canvas
    // afterwards; count the sites so a refactor that drops one fails loudly.
    const bailChecks = effect.match(/if \(bail\(\)\) return;/g) ?? [];
    expect(bailChecks.length).toBeGreaterThanOrEqual(4);
  });

  it('lights a spoken stop only after its own line reports audio started', () => {
    const stopRunner = effect.slice(effect.indexOf('const runSpokenStop'));
    const started = stopRunner.indexOf('await waitLineStart(handle)');
    const lit = stopRunner.indexOf('applyStop(spot, line)', started);
    expect(started).toBeGreaterThan(-1);
    expect(lit).toBeGreaterThan(started);
  });

  it('keeps the barrier out of muted turns (the muted branch returns first)', () => {
    const mutedBranch = effect.indexOf('if (mutedRef.current) {');
    const walkActiveSet = effect.indexOf('walkActive.current = true;');
    expect(mutedBranch).toBeGreaterThan(-1);
    expect(mutedBranch).toBeLessThan(walkActiveSet);
  });
});

describe('barge-in flushes the walk, not just the line', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  it('onBargeIn routes through showAll (walk flush + speech cancel in one gesture)', () => {
    const bargeIn = src.indexOf('onBargeIn: () => {');
    expect(bargeIn).toBeGreaterThan(-1);
    const handler = src.slice(bargeIn, src.indexOf('},', bargeIn));
    expect(handler).toMatch(/showAll\(\)/);
    expect(handler).toMatch(/bargedInRef\.current = true/);
  });
});
