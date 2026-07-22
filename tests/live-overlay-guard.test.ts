import { describe, expect, it } from 'vitest';
import { anyOverlayOpen } from '../src/live/hooks/overlayGuard';

// Watch Me Think keeps its settled map "behind" any overlay the user opens from it (Share,
// Present, the palette…). Escape must close only that overlay — never exit the map, which
// would reset a kept shape (data loss). The Escape listener and its effect deps both read
// this single predicate, so this is the contract that keeps one keypress from doing both.

// Every overlay closed: Escape is allowed to leave Watch Me Think.
const allClosed = {
  paletteOpen: false,
  shareOpen: false,
  exportOpen: false,
  dashOpen: false,
  showSettings: false,
  proofOpen: false,
  showHow: false,
  replayAt: null,
  recapOpen: false,
  atlasOpen: false,
  rehearsalOpen: false,
  delegateOpen: false,
  srsOpen: false,
  zoomLevel: null,
  mindViewOpen: false,
} as const;

describe('anyOverlayOpen', () => {
  it('reports no overlay when everything is closed', () => {
    expect(anyOverlayOpen({ ...allClosed })).toBe(false);
  });

  // Each boolean overlay must independently count as "holding attention".
  const booleanKeys = [
    'paletteOpen',
    'shareOpen',
    'exportOpen',
    'dashOpen',
    'showSettings',
    'proofOpen',
    'showHow',
    'recapOpen',
    'atlasOpen',
    'rehearsalOpen',
    'delegateOpen',
    'srsOpen',
    'mindViewOpen',
  ] as const;
  it.each(booleanKeys)('counts %s as an open overlay', (key) => {
    expect(anyOverlayOpen({ ...allClosed, [key]: true })).toBe(true);
  });

  // replayAt is a position, not a flag — 0 is a valid open replay and must count.
  it('counts a replay at any position, including 0', () => {
    expect(anyOverlayOpen({ ...allClosed, replayAt: 0 })).toBe(true);
    expect(anyOverlayOpen({ ...allClosed, replayAt: 3 })).toBe(true);
  });

  // zoomLevel is a mode name, not a flag — any non-null deck counts.
  it('counts an open semantic-zoom deck', () => {
    expect(anyOverlayOpen({ ...allClosed, zoomLevel: 'chapters' })).toBe(true);
  });
});
