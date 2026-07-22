import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, fireEvent, waitFor } from '@testing-library/react';
import type { TurnFrame } from '../src/live/history';

const { generateReelSpy } = vi.hoisted(() => ({ generateReelSpy: vi.fn() }));

// ShareModal pulls in the whole reel pipeline (recorder, audio synthesis, the live player). None of
// that is what we're testing — focus management + the responsive stack — so stub the heavy modules
// with light, deterministic doubles. buildReelFallback returns a ready script synchronously, which is
// what the no-cfg path uses, so the modal renders its controls immediately.
vi.mock('../src/clip/reel/ReelPlayer', () => ({
  ReelPlayer: ({ script }: { script: { seed: number } }) => (
    <div data-testid="reel-player" data-seed={script.seed} />
  ),
}));
vi.mock('../src/clip/capture', () => ({
  captureSupported: () => true,
  startStoryRecording: vi.fn(),
  // The quality picker reads its hints straight from the encoder's tier table (tests/clip-capture.test.ts
  // pins that they match); here it just needs to render.
  qualityHint: () => 'up to 30 fps · 10 Mbps',
}));
vi.mock('../src/clip/share', () => ({
  downloadClip: vi.fn(),
  shareClip: vi.fn(),
}));
vi.mock('../src/clip/reel/audioTrack', () => ({
  renderReelAudio: vi.fn().mockResolvedValue({ buffer: null, timings: [] }),
  bufferToStream: () => null,
  makePreviewAudio: () => null,
}));
vi.mock('../src/clip/reel/director', () => ({
  buildReelFallback: () => ({
    palette: 'aurora',
    seed: 0,
    slides: [{ content: 'title' }],
    durationMs: 8000,
  }),
  generateReel: generateReelSpy,
  reseedFinishes: (s: unknown) => s,
}));
vi.mock('../src/clip/reel/palette', () => ({
  PALETTES: [{ id: 'aurora', label: 'Aurora', dot: '#000', blurb: '' }],
}));

import { ShareModal } from '../src/clip/ShareModal';

function frame(at = 1): TurnFrame {
  return {
    question: 'What is photosynthesis?',
    narration: 'Plants turn light into sugar.',
    mode: 'replace',
    tour: [],
    spec: { topic: 'Photosynthesis', blocks: [] } as never,
    at,
  };
}

// matchMedia is not in jsdom — install a controllable stub whose `matches` answers our breakpoint.
function mockMatchMedia(narrow: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: narrow,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('ShareModal accessibility', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    mockMatchMedia(false);
    generateReelSpy.mockReset();
    generateReelSpy.mockResolvedValue({
      palette: 'aurora',
      seed: 99,
      slides: [{ content: 'title' }],
      durationMs: 8000,
    });
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it('exposes a labelled modal dialog', () => {
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Share your Mavéa session as a clip');
  });

  it('moves focus into the dialog on open', () => {
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    const dialog = getByRole('dialog');
    // Either the dialog itself or one of its controls now holds focus.
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={onClose} />);
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('stacks into a single column below the narrow breakpoint', () => {
    mockMatchMedia(true);
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    expect(getByRole('dialog').style.flexDirection).toBe('column');
  });

  it('stays a side-by-side row on a wide viewport', () => {
    mockMatchMedia(false);
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    // The default row layout leaves flexDirection unset (inline-style empty), not 'column'.
    expect(getByRole('dialog').style.flexDirection).not.toBe('column');
  });

  it('shows the zero-cost reel immediately and deduplicates the directed call across remounts', async () => {
    const cfg = { provider: 'openai', model: 'test-model', apiKey: 'test-key' } as never;
    const first = render(<ShareModal frames={[frame(101)]} cfg={cfg} onClose={() => {}} />);

    expect(first.getByTestId('reel-player')).toHaveAttribute('data-seed', '0');
    await waitFor(() => expect(generateReelSpy).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<ShareModal frames={[frame(101)]} cfg={cfg} onClose={() => {}} />);
    await waitFor(() => expect(generateReelSpy).toHaveBeenCalledTimes(1));
  });

  it('ignores a late directed result after the user changes the preview', async () => {
    let resolveDirected!: (value: {
      palette: string;
      seed: number;
      slides: { content: string }[];
      durationMs: number;
    }) => void;
    generateReelSpy.mockReturnValue(
      new Promise((resolve) => {
        resolveDirected = resolve;
      }),
    );
    const cfg = { provider: 'openai', model: 'test-model', apiKey: 'test-key' } as never;
    const view = render(<ShareModal frames={[frame(102)]} cfg={cfg} onClose={() => {}} />);
    await waitFor(() => expect(generateReelSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(view.getByRole('button', { name: 'Square' }));
    await act(async () => {
      resolveDirected({
        palette: 'aurora',
        seed: 99,
        slides: [{ content: 'title' }],
        durationMs: 8000,
      });
      await Promise.resolve();
    });

    expect(view.getByTestId('reel-player')).toHaveAttribute('data-seed', '0');
  });
});
