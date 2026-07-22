import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// The lite performance tier calms weak machines entirely through CSS: an html[data-perf='lite']
// attribute pauses the always-on ambient animations, drops backdrop-filter blur, and swaps the
// landing aurora for a blur-free one. jsdom can't render or play any of that, so — like
// motion-contract.test.ts — this is a SOURCE-level regression guard on the contract the runtime
// (lib/perfTier.ts, lib/perfProbe.ts, applied via main.tsx) depends on. If any of these break,
// lite mode silently stops relieving the exact GPU cost it exists to remove.

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const presenceCanvas = strip(read('src/styles/presence-canvas.css'));
const friendAliveness = strip(read('src/styles/friend-aliveness.css'));
const presenceStyles = strip(read('src/styles/presence-styles.css'));
const perfLite = strip(read('src/styles/perf-lite.css'));
const flagship = strip(read('src/flagship/flagship.css'));
const tokens = strip(read('src/styles/tokens-base.css'));

// The ambient loops that MUST be pausable by lite (idle, always-on GPU cost). Each is keyed by the
// keyframe name its declaration uses; the declaration must carry the --ambient-play longhand so a
// single `--ambient-play: paused` freezes it. State/reaction loops (blink, talk, gaze) are
// deliberately NOT in this list — they stay alive in lite.
const AMBIENT: { name: string; source: string; file: string }[] = [
  { name: 'breathe', source: presenceCanvas, file: 'presence-canvas.css (aura)' },
  { name: 'mascot-bob', source: presenceCanvas, file: 'presence-canvas.css' },
  { name: 'mascot-curtain', source: presenceCanvas, file: 'presence-canvas.css' },
  { name: 'mascot-shimmer', source: presenceCanvas, file: 'presence-canvas.css' },
  { name: 'mascot-flow', source: presenceCanvas, file: 'presence-canvas.css' },
  { name: 'mascot-swell', source: presenceCanvas, file: 'presence-canvas.css' },
  { name: 'idle-perk', source: friendAliveness, file: 'friend-aliveness.css' },
  { name: 'mascot-hueflow', source: presenceStyles, file: 'presence-styles.css' },
];

/** Grab the declaration block that contains the first `animation:` shorthand naming `keyframe`. */
function blockAround(css: string, keyframe: string): string | null {
  // Find the `animation: <keyframe> …;` (not the @keyframes definition) and return the rule body
  // it lives in (from the preceding `{` to the next `}`).
  const anim = new RegExp(`animation:[^;]*\\b${keyframe}\\b`);
  const m = anim.exec(css);
  if (!m) return null;
  const open = css.lastIndexOf('{', m.index);
  const close = css.indexOf('}', m.index);
  if (open === -1 || close === -1) return null;
  return css.slice(open, close);
}

describe('perf-lite — every ambient animation is pausable', () => {
  for (const { name, source, file } of AMBIENT) {
    it(`${name} (${file}) carries the --ambient-play longhand after its shorthand`, () => {
      const block = blockAround(source, name);
      expect(block, `no animation shorthand naming ${name} found`).toBeTruthy();
      expect(
        block!,
        `${name}'s declaration is missing animation-play-state: var(--ambient-play, running)`,
      ).toMatch(/animation-play-state:\s*var\(--ambient-play,\s*running\)/);
    });
  }
});

describe('perf-lite — the face stays alive: blink is NOT pausable', () => {
  it('the blink declaration does not carry --ambient-play (it must keep running in lite)', () => {
    const block = blockAround(presenceCanvas, 'mascot-blink');
    expect(block, 'no mascot-blink animation found').toBeTruthy();
    expect(block!).not.toMatch(/--ambient-play/);
  });
});

describe('perf-lite.css — the lite tier zeroes the ambient + glass knobs', () => {
  it('sets --ambient-play: paused under html[data-perf=lite]', () => {
    expect(perfLite).toMatch(/:root\[data-perf=['"]lite['"]\][\s\S]*--ambient-play:\s*paused/);
  });

  it('zeroes the bar + shared glass blur tokens', () => {
    expect(perfLite).toMatch(/--bar-glass-blur:\s*none/);
    expect(perfLite).toMatch(/--glass-blur-strong:\s*none/);
    expect(perfLite).toMatch(/--glass-blur-soft:\s*none/);
    expect(perfLite).toMatch(/--glass-blur-faint:\s*none/);
  });

  it('turns the aura into a static glow (filter: none)', () => {
    expect(perfLite).toMatch(/\.presence\s+\.aura\s*\{\s*filter:\s*none/);
  });
});

describe('tokens-base.css — the shared glass-blur tokens exist to be zeroed', () => {
  for (const tok of ['--glass-blur-strong', '--glass-blur-soft', '--glass-blur-faint']) {
    it(`defines ${tok}`, () => {
      expect(tokens).toMatch(new RegExp(`${tok}:\\s*blur\\(`));
    });
  }
});

describe('flagship aurora — routed through vars, and reduced-motion drops the blur (the bug fix)', () => {
  it('.fl-landing defines the aurora blur + palette + calm-stand-in vars', () => {
    expect(flagship).toMatch(/--fl-aurora-blur:\s*blur\(95px\)/);
    expect(flagship).toMatch(/--fl-aurora-calm-a:/);
    expect(flagship).toMatch(/--fl-aurora-calm-b:/);
  });

  it('the ::before/::after pseudos read the blur + palette from the vars', () => {
    expect(flagship).toMatch(/filter:\s*var\(--fl-aurora-blur\)/);
    expect(flagship).toMatch(/background:\s*var\(--fl-aurora-bg-a\)/);
    expect(flagship).toMatch(/background:\s*var\(--fl-aurora-bg-b\)/);
  });

  it('the reduced-motion block zeroes --fl-aurora-blur (blur no longer rasters with motion off)', () => {
    const rm = flagship.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(rm, 'no reduced-motion block found in flagship.css').toBeTruthy();
    expect(rm![1]).toMatch(/--fl-aurora-blur:\s*none/);
  });

  it('the lite tier also zeroes the aurora blur and stops the drift', () => {
    expect(perfLite).toMatch(/\.fl-landing\s*\{[\s\S]*--fl-aurora-blur:\s*none/);
    expect(perfLite).toMatch(/\.fl-landing::(before|after)[\s\S]*animation:\s*none/);
  });
});
