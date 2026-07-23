// The unified capsule (Design canvas "1a"): the composer is ONE bordered card with Mavéa's-output
// status strip on top (a divider under it) and the input row beneath. The status strip holds her
// voice toggle + which-model chip (moved out of the topbar so they never read as scoped to one
// reply), and an equalizer orb + one-line transcript. The mute control always shows the words
// "Mavéa's voice" so it can never be mistaken for the microphone; mic mode lives behind a chevron
// on the mic button itself (MicModePopover), never adjacent to the voice toggle.
//
// This can't be proven by mounting LiveApp (needs a landed turn, live config, settings state) —
// see live-tour-replay-guard.test.tsx for why that class of wiring is asserted by inspecting the
// source instead of a full render.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('the unified capsule holds Mavéa’s output settings, not the topbar', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  const topbarStart = src.indexOf('<div className="topbar">');
  const topbarEnd = src.indexOf('</div>', topbarStart);
  const topbar = src.slice(topbarStart, topbarEnd);

  const stripStart = src.indexOf('<div className="voice-strip">');
  const stripEnd = src.indexOf('<CommandComposer', stripStart);
  const strip = src.slice(stripStart, stripEnd);

  it('no longer renders the model chip, mic-mode toggle, or voice controls in the topbar', () => {
    expect(topbar).not.toMatch(/live-model-chip/);
    expect(topbar).not.toMatch(/mic-mode/);
    expect(topbar).not.toMatch(/voice-switch/);
  });

  it('the status strip renders for the whole conversation — never gated on muted', () => {
    // The capsule wraps the composer once a conversation is under way, and the status strip inside
    // rides that same gate. What matters — and what this test is really for — is that MUTE never
    // hides it: a strip that vanished when you muted would read as a stuck answer.
    expect(src).toMatch(/dockCapsule \? 'voice-capsule' : 'composer-passthrough'/);
    const gateStart = src.indexOf('{dockCapsule && (\n            <div className="voice-strip">');
    expect(gateStart, 'voice-strip not gated on a bare dockCapsule').toBeGreaterThan(-1);
    expect(strip).not.toMatch(/muted \?\s*null/);
  });

  it('the mute control always shows the words "Mavéa\'s voice" — never a bare icon', () => {
    const labelCount = (strip.match(/voice-switch-label">Mavéa's voice</g) ?? []).length;
    expect(labelCount).toBe(1);
    expect(strip).toMatch(/aria-pressed=\{!muted\}/);
  });

  it('shows the transcript unconditionally — the subtitle stays even when muted', () => {
    // The Design source has no CC button, and (per the "keep subtitles when muted" decision) the
    // transcript is NOT gated on speaking: it renders the current answer's line — spokenNow while
    // voicing, else the turn's narration — whether Mavéa is speaking or muted. The row's width is
    // already reserved, so a muted turn's line is still worth reading rather than a blank gap.
    expect(strip).not.toMatch(/Icon\.captions/);
    expect(strip).not.toMatch(/cfg\.captions/);
    const tIdx = strip.indexOf('className="vc-transcript"');
    expect(tIdx, '.vc-transcript not found').toBeGreaterThan(-1);
    const tBlock = strip.slice(tIdx, tIdx + 160);
    expect(tBlock).toMatch(/\{spokenNow \?\? turn\.narration \?\? ''\}/);
    expect(tBlock, 'transcript must not be gated on speakingSticky').not.toMatch(/speakingSticky/);
  });

  it('keeps the pulsing "Speaking" pill gated on active voicing', () => {
    // The pill (not the transcript) is the speaking indicator — it appears only while she's
    // voicing, so a muted turn shows the line without falsely claiming she's talking. It also
    // yields to the preparing beat: while the next line is still synthesizing, nothing is
    // audible, and a pulsing "Speaking" over silence is exactly the lie the quiet orb replaces.
    const pillIdx = strip.indexOf('className="vc-status"');
    expect(pillIdx, '.vc-status pill not found').toBeGreaterThan(-1);
    const before = strip.slice(Math.max(0, pillIdx - 160), pillIdx);
    expect(before).toMatch(/speakingSticky && !voicePreparing \? \(/);
  });

  it('shows the honest "Preparing" beat only while the walk barrier holds, never as Speaking', () => {
    // While the pre-walk barrier waits (cold voice, chunks landing) the pill reads Preparing —
    // it must be gated behind speakingSticky (real voicing always wins) and off when muted.
    const prepIdx = strip.indexOf('vc-preparing');
    expect(prepIdx, '.vc-preparing pill not found').toBeGreaterThan(-1);
    const before = strip.slice(Math.max(0, prepIdx - 600), prepIdx);
    expect(before).toMatch(/walkPreparing && !muted \? \(/);
    const block = strip.slice(prepIdx, prepIdx + 400);
    expect(block).toMatch(/Preparing voice…/);
    expect(block).not.toMatch(/>Speaking</);
  });

  it('runs status pill → transcript → voice switch → speed chip → explain chip → model chip, in order', () => {
    expect(strip.indexOf('vc-status')).toBeGreaterThan(-1);
    expect(strip.indexOf('vc-status')).toBeLessThan(strip.indexOf('vc-transcript'));
    expect(strip.indexOf('vc-transcript')).toBeLessThan(strip.indexOf('voice-switch'));
    expect(strip.indexOf('voice-switch')).toBeLessThan(strip.indexOf('VoiceSpeedChip'));
    expect(strip.indexOf('VoiceSpeedChip')).toBeLessThan(strip.indexOf('ExplainLevelChip'));
    expect(strip.indexOf('ExplainLevelChip')).toBeLessThan(strip.indexOf('live-model-chip'));
  });

  it('mic mode lives on the mic button itself, never a row inside the strip', () => {
    expect(strip).not.toMatch(/mic-mode/);
    const micExtraStart = src.indexOf('micExtra=');
    expect(micExtraStart, 'micExtra prop not found on CommandComposer').toBeGreaterThan(-1);
    const micExtraBlock = src.slice(micExtraStart, micExtraStart + 400);
    expect(micExtraBlock).toMatch(/MicModePopover/);
  });
});
