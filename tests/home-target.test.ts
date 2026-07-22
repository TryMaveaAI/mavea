import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homeTarget } from '../src/lib/homeTarget';
import { SESSION_STORAGE_KEY } from '../src/live/session/store';

// Every standalone surface used to guess its own way home: Flashcards and Courses went to Live,
// Gallery went to the landing, Prism / Synthesis / Deep Zoom / Ripple went to the landing, and
// Dashboards had a hardcoded brand link. So leaving one surface and leaving another did opposite
// things. One rule now decides: you have a Live session → that's home; you don't → the front door.

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('homeTarget', () => {
  it('sends you back to Live when a session exists', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ any: 'session' }));
    expect(homeTarget()).toEqual({ href: '#/live', label: 'Live' });
  });

  it('sends you to the front door when there is no session', () => {
    expect(homeTarget()).toEqual({ href: '#/', label: 'Mavéa' });
  });

  it('survives storage being walled off (private mode, embedded contexts)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => homeTarget()).not.toThrow();
    expect(homeTarget().href).toBe('#/');
  });
});

// The point of the shared helper is that no surface keeps its own private answer. This is the
// tripwire: a new surface (or a regression) that hardcodes its own way home fails here.
describe('every standalone surface uses the shared home target', () => {
  const SURFACES = [
    'src/gallery/GalleryApp.tsx',
    'src/live/srs/FlashcardsApp.tsx',
    'src/live/course/CoursesApp.tsx',
    'src/live/prism/PrismApp.tsx',
    'src/live/prism/SynthesisApp.tsx',
    'src/live/deepzoom/DeepZoomApp.tsx',
    'src/live/ripple/RippleApp.tsx',
    'src/live/dashboards/DashTopBar.tsx',
  ];

  it.each(SURFACES)('%s resolves home through homeTarget()', (file) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(src).toContain('homeTarget');
  });

  it.each(SURFACES)('%s does not hardcode its own destination', (file) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8');
    // The back control must not pin a literal route: that is exactly how the surfaces drifted apart.
    expect(src).not.toMatch(/window\.location\.hash = '#\/live';/);
    expect(src).not.toMatch(/window\.location\.hash = '#\/';/);
  });
});
