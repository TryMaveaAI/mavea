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
    // Prefix-matched, not the whole call: applyStop has grown arguments (the stop index, so a
    // voiced walk can write its margin aside) and will grow more. What this pins is the ORDER —
    // the stop lights after its own audio is reported started — never the argument list.
    const lit = stopRunner.indexOf('applyStop(spot, line', started);
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

describe('a barge-in PAUSES the walk; only a real question ends it', () => {
  // The old behavior destroyed the walk before knowing what was said: an "uh huh" dumped every
  // card at once, killed the spotlight, then re-read the whole narration over a canvas that no
  // longer tracked it. Same inspection style as above — the wiring needs live audio to mount.
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  it('onBargeIn inside a walk parks it instead of flushing it', () => {
    const at = src.indexOf('onBargeIn: () => {');
    const body = src.slice(at, src.indexOf('},', at));
    expect(body).toContain('walkActive.current');
    expect(body).toContain('cancelSpeech()');
    expect(body).toContain('armWalkPause()');
    // The flush survives only for the no-walk case.
    expect(body.indexOf('armWalkPause()')).toBeLessThan(body.indexOf('showAll()'));
  });

  it('filler and self-echo resume the parked stop; a real question aborts and submits', () => {
    const at = src.indexOf('if (bargedInRef.current) {');
    const body = src.slice(at, at + 1600);
    // Her own leaked words never become a paid model call.
    expect(body).toContain('isRecentlySpoken(text)');
    expect(body).toMatch(/isRecentlySpoken\(text\)\)\s*\{\s*settleWalkPause\('replay'\)/);
    // Filler resumes the stop, never re-reads the whole narration over a parked walk.
    expect(body).toMatch(/walkPauseRef\.current\)\s*\{[\s\S]{0,400}settleWalkPause\('replay'\)/);
    // A real question ends the walk before submitting.
    expect(body).toMatch(/settleWalkPause\('abort'\);\s*showAll\(\)/);
  });

  it('a mic tap mid-walk takes the same pause path as a barge-in', () => {
    const at = src.indexOf('} else if (walkActive.current) {');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 700);
    expect(body).toContain('cancelSpeech()');
    expect(body).toContain('armWalkPause()');
    expect(body).toContain('voice.start(');
  });

  it('the walk consumes the verdict at its stop boundary, and every teardown settles it', () => {
    expect(src).toContain('const verdict = await pauseVerdict()');
    // Both the flush hatch and the effect cleanup resolve a parked pause — a pending promise
    // must never outlive the walk that parked it.
    const flushAt = src.indexOf('flushWalkRef.current = () => {');
    expect(src.slice(flushAt, flushAt + 400)).toContain("settleWalkPause('abort')");
    // Two null-assignments exist (an early-exit path and the effect cleanup) — the cleanup is
    // the LAST one, and it must settle before it lets go of the hatch.
    const cleanupAt = src.lastIndexOf('flushWalkRef.current = null;');
    expect(src.slice(cleanupAt - 400, cleanupAt)).toContain("settleWalkPause('abort')");
  });
});
