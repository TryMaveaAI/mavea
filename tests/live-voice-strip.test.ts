// The unified capsule: one bordered card. At rest it is a single input row; Mavéa's-output settings
// (voice switch, speed, explanation level, model) live behind one Settings button in that row, and
// the status strip above appears ONLY while she is speaking, preparing or paused. The spoken line is
// not repeated in the dock — the canvas already carries it. The mute control always shows the words
// "Mavéa's voice" so it can never be mistaken for the microphone; mic mode lives behind a chevron on
// the mic button itself (MicModePopover).
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

  const settingsStart = src.indexOf('<DockSettings>');
  const settings = src.slice(settingsStart, src.indexOf('</DockSettings>', settingsStart));

  it('no longer renders the model chip, mic-mode toggle, or voice controls in the topbar', () => {
    expect(topbar).not.toMatch(/live-model-chip/);
    expect(topbar).not.toMatch(/mic-mode/);
    expect(topbar).not.toMatch(/voice-switch/);
  });

  it('the status strip appears only while there is a voice status — and mute never hides the settings', () => {
    expect(src).toMatch(/dockCapsule \? 'voice-capsule' : 'composer-passthrough'/);
    expect(src).toMatch(/\{dockCapsule && dockHasStatus && \(\s*<div className="voice-strip">/);
    expect(src).toMatch(
      /const dockHasStatus =\s*walkPaused \|\| speakingSticky \|\| \(!muted && \(walkPreparing \|\| voicePreparing\)\);/,
    );
    expect(settingsStart, 'DockSettings not found').toBeGreaterThan(-1);
    expect(settings).not.toMatch(/muted \?\s*null/);
    expect(src).toMatch(/\{dockCapsule && \(\s*<DockSettings>/);
  });

  it('the mute control always shows the words "Mavéa\'s voice" — never a bare icon', () => {
    const labelCount = (settings.match(/voice-switch-label">Mavéa's voice</g) ?? []).length;
    expect(labelCount).toBe(1);
    expect(settings).toMatch(/aria-pressed=\{!muted\}/);
  });

  it('does not repeat the spoken line in the dock', () => {
    expect(src).not.toMatch(/className="vc-transcript"/);
  });

  it('keeps the pulsing "Speaking" pill gated on active voicing', () => {
    // It also yields to the preparing beat: while the next line is still synthesizing, nothing is
    // audible, and a pulsing "Speaking" over silence is exactly the lie the quiet orb replaces.
    const pillIdx = strip.indexOf('className="vc-status"');
    expect(pillIdx, '.vc-status pill not found').toBeGreaterThan(-1);
    const before = strip.slice(Math.max(0, pillIdx - 160), pillIdx);
    expect(before).toMatch(/speakingSticky && !voicePreparing \? \(/);
  });

  it('shows the honest "Preparing" beat only while the walk barrier holds, never as Speaking', () => {
    const prepIdx = strip.indexOf('vc-preparing');
    expect(prepIdx, '.vc-preparing pill not found').toBeGreaterThan(-1);
    const before = strip.slice(Math.max(0, prepIdx - 600), prepIdx);
    expect(before).toMatch(/walkPreparing && !muted \? \(/);
    const block = strip.slice(prepIdx, prepIdx + 400);
    expect(block).toMatch(/Preparing voice…/);
    expect(block).not.toMatch(/>Speaking</);
  });

  it('runs voice switch → speed chip → explain chip → model chip inside Settings, in order', () => {
    expect(settings.indexOf('voice-switch')).toBeGreaterThan(-1);
    expect(settings.indexOf('voice-switch')).toBeLessThan(settings.indexOf('VoiceSpeedChip'));
    expect(settings.indexOf('VoiceSpeedChip')).toBeLessThan(settings.indexOf('ExplainLevelChip'));
    expect(settings.indexOf('ExplainLevelChip')).toBeLessThan(settings.indexOf('live-model-chip'));
  });

  it('mic mode lives on the mic button itself, never a row inside the strip', () => {
    expect(strip).not.toMatch(/mic-mode/);
    const micExtraStart = src.indexOf('micExtra=');
    expect(micExtraStart, 'micExtra prop not found on CommandComposer').toBeGreaterThan(-1);
    const micExtraBlock = src.slice(micExtraStart, micExtraStart + 400);
    expect(micExtraBlock).toMatch(/MicModePopover/);
  });
});
