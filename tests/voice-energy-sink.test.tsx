import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import {
  domEnergyHost,
  registerVoiceEnergySink,
  useVoiceEnergySink,
} from '../src/voice/voiceEnergy';

// --voice-energy is written every animation frame while Mavéa speaks. Those writes are scoped:
// they land on the registered SINK elements (the wrappers around each mounted face) instead of
// :root, so each frame's style invalidation stays inside the presence subtree rather than
// re-costing a full canvas of blocks. This file pins the three pieces that keep that true — the
// routing itself, the @property registration that lets the engine treat the var as typed, and a
// source-level guard that no <Presence/> mount site can silently lose its sink (the :root
// fallback only covers the case where NO sink is registered; the moment any other surface
// registers one, an unregistered face's mouth would go still).

const SRC = join(__dirname, '..', 'src');

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFilesUnder(path));
    else if (entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

describe('every <Presence/> mount site registers a voice-energy sink', () => {
  // Presence.tsx itself is the DOM-locked face — the sink belongs on the element WRAPPING it.
  const mounts = tsxFilesUnder(SRC).filter(
    (f) =>
      !f.endsWith(join('presence', 'Presence.tsx')) &&
      readFileSync(f, 'utf8').includes('<Presence'),
  );

  it('the scan finds the known mount sites (so a rename cannot blind the guard)', () => {
    expect(mounts.length).toBeGreaterThanOrEqual(7);
  });

  for (const file of mounts) {
    it(`${relative(SRC, file)} references useVoiceEnergySink`, () => {
      expect(
        readFileSync(file, 'utf8').includes('useVoiceEnergySink'),
        `${relative(SRC, file)} renders <Presence but never wires useVoiceEnergySink — its mouth goes still whenever any other surface holds a sink`,
      ).toBe(true);
    });
  }
});

describe('--voice-energy is a registered custom property', () => {
  it('presence-canvas.css declares @property (typed number, inheriting, resting at 0)', () => {
    const css = readFileSync(join(SRC, 'styles', 'presence-canvas.css'), 'utf8');
    const block = /@property\s+--voice-energy\s*\{([^}]*)\}/.exec(css);
    expect(block, 'no @property --voice-energy rule found').toBeTruthy();
    expect(block![1]).toMatch(/syntax:\s*'<number>'/);
    expect(block![1]).toMatch(/inherits:\s*true/);
    expect(block![1]).toMatch(/initial-value:\s*0/);
  });
});

describe('domEnergyHost — sink-scoped energy writes', () => {
  afterEach(() => {
    // The publisher's stop() path: rests the attribute and clears the var from root + sinks.
    domEnergyHost.setSync(false);
  });

  it('falls back to :root while no sink is registered (a future host still gets a mouth)', () => {
    domEnergyHost.setVar(0.4);
    expect(document.documentElement.style.getPropertyValue('--voice-energy')).toBe('0.4');
  });

  it('writes to every registered sink INSTEAD of :root, and unregistering restores the fallback', () => {
    domEnergyHost.setVar(0.1); // the fallback holds a value before any face registers
    const a = document.createElement('div');
    const b = document.createElement('span');
    const offA = registerVoiceEnergySink(a);
    const offB = registerVoiceEnergySink(b);

    domEnergyHost.setVar(0.5);
    expect(a.style.getPropertyValue('--voice-energy')).toBe('0.5');
    expect(b.style.getPropertyValue('--voice-energy')).toBe('0.5');
    // The whole-document write stopped: :root still holds the stale pre-registration value.
    expect(document.documentElement.style.getPropertyValue('--voice-energy')).toBe('0.1');

    offA();
    expect(a.style.getPropertyValue('--voice-energy')).toBe(''); // unregister clears its element
    domEnergyHost.setVar(0.7);
    expect(b.style.getPropertyValue('--voice-energy')).toBe('0.7');
    expect(a.style.getPropertyValue('--voice-energy')).toBe('');

    offB();
    domEnergyHost.setVar(0.9); // set empty again → the :root fallback returns
    expect(document.documentElement.style.getPropertyValue('--voice-energy')).toBe('0.9');
  });

  it('setSync(false) — the publisher resting — clears the var from :root and every sink', () => {
    const el = document.createElement('div');
    const off = registerVoiceEnergySink(el);
    domEnergyHost.setSync(true);
    domEnergyHost.setVar(0.6);
    expect(document.documentElement.getAttribute('data-voice-sync')).toBe('on');

    domEnergyHost.setSync(false);
    expect(document.documentElement.hasAttribute('data-voice-sync')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--voice-energy')).toBe('');
    expect(el.style.getPropertyValue('--voice-energy')).toBe('');
    off();
  });
});

describe('useVoiceEnergySink — the wrapper ref', () => {
  afterEach(() => {
    domEnergyHost.setSync(false);
  });

  function Wrap(): ReactElement {
    const voiceSinkRef = useVoiceEnergySink();
    return <div data-testid="wrap" ref={voiceSinkRef} />;
  }

  it('registers the wrapper for exactly its mounted lifetime', () => {
    const { unmount, getByTestId } = render(<Wrap />);
    const el = getByTestId('wrap');

    domEnergyHost.setVar(0.3);
    expect(el.style.getPropertyValue('--voice-energy')).toBe('0.3');
    expect(document.documentElement.style.getPropertyValue('--voice-energy')).toBe('');

    unmount();
    expect(el.style.getPropertyValue('--voice-energy')).toBe(''); // cleanup cleared it…
    domEnergyHost.setVar(0.8);
    expect(el.style.getPropertyValue('--voice-energy')).toBe(''); // …and unregistered it
    expect(document.documentElement.style.getPropertyValue('--voice-energy')).toBe('0.8');
  });
});
