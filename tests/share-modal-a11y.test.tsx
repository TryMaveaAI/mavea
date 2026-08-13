import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import type { TurnFrame } from '../src/live/history';

const { renderReelAudioSpy, shareClipSpy, startStoryRecordingSpy, toastSpy } = vi.hoisted(() => ({
  renderReelAudioSpy: vi.fn(),
  shareClipSpy: vi.fn(),
  startStoryRecordingSpy: vi.fn(),
  toastSpy: vi.fn(),
}));

// ShareModal pulls in the whole reel pipeline (recorder, audio synthesis, the live player). None of
// that is what we're testing — focus management + the responsive stack — so stub the heavy modules
// with light, deterministic doubles. buildReelFallback returns a ready script synchronously, which is
// what every conversation path uses, so the modal renders its controls immediately.
vi.mock('../src/clip/reel/ReelPlayer', () => ({
  ReelPlayer: ({
    script,
    frameRef,
    onDone,
  }: {
    script: { seed: number };
    frameRef?: (element: HTMLDivElement | null) => void;
    onDone?: () => void;
  }) => (
    <div ref={frameRef} data-testid="reel-player" data-seed={script.seed}>
      {onDone && (
        <button type="button" onClick={onDone}>
          Finish reel recording
        </button>
      )}
    </div>
  ),
}));
vi.mock('../src/clip/capture', () => ({
  captureSupported: () => true,
  startStoryRecording: startStoryRecordingSpy,
  // The quality picker reads its hints straight from the encoder's tier table (tests/clip-capture.test.ts
  // pins that they match); here it just needs to render.
  qualityHint: () => 'up to 30 fps · 10 Mbps',
}));
vi.mock('../src/clip/share', () => ({
  downloadClip: vi.fn(),
  shareClip: shareClipSpy,
}));
vi.mock('../src/clip/reel/audioTrack', () => ({
  renderReelAudio: renderReelAudioSpy,
  bufferToStream: () => null,
  makePreviewAudio: () => null,
}));
vi.mock('../src/lib/toast', () => ({ toast: toastSpy }));
vi.mock('../src/clip/reel/director', () => ({
  buildReelFallback: () => ({
    palette: 'aurora',
    seed: 0,
    slides: [{ content: 'title' }],
    durationMs: 8000,
  }),
  reseedFinishes: (s: unknown) => s,
}));
vi.mock('../src/clip/reel/palette', () => ({
  PALETTES: [{ id: 'aurora', label: 'Aurora', dot: '#000', blurb: '' }],
}));
// The studio itself is covered by tests/conversation-video-studio.test.tsx; here it only needs to be
// able to report that it went busy, which is what gates the modal's close affordances.
vi.mock('../src/clip/conversation/ConversationVideoStudio', () => ({
  ConversationVideoStudio: ({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) => (
    <div data-testid="conversation-studio" tabIndex={-1}>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        start-export
      </button>
    </div>
  ),
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
    renderReelAudioSpy.mockReset();
    renderReelAudioSpy.mockResolvedValue({ buffer: null, timings: [], missing: 0 });
    shareClipSpy.mockReset();
    startStoryRecordingSpy.mockReset();
    toastSpy.mockReset();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it('exposes a labelled modal dialog', () => {
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Share this conversation as a video');
  });

  it('opens on Conversation and keeps Reel as a separate video style', () => {
    const { getByRole, getByTestId } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    // Two pressed-state toggles in a labelled group — not ARIA tabs, whose keyboard contract
    // (arrow-key switching, a linked tabpanel) this switcher does not implement.
    const styles = getByRole('group', { name: 'Video style' });
    expect(styles).toBeInTheDocument();
    expect(getByRole('button', { name: 'Conversation' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByTestId('conversation-studio')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Reel' }));
    expect(getByRole('button', { name: 'Reel' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByTestId('reel-player')).toBeInTheDocument();
    // The reel's own single-select chips carry their state the same way.
    expect(getByRole('button', { name: 'Aurora' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: 'Story' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'false');
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

  it('leaves stacking entirely to the stylesheet', () => {
    // An inline flex-direction always beats the media query, which is how the JS and the CSS once
    // asserted opposite stacking orders with only the JS taking effect.
    mockMatchMedia(true);
    const { getByRole } = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    expect(getByRole('dialog').style.flexDirection).toBe('');
  });

  it('disables Close mid-export instead of silently swallowing the click', () => {
    const onClose = vi.fn();
    const { getByRole, getByText } = render(<ShareModal frames={[frame()]} onClose={onClose} />);
    const close = getByRole('button', { name: 'Close' });
    expect(close).toBeEnabled();
    fireEvent.click(getByText('start-export'));
    expect(close).toBeDisabled();
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the same local zero-cost reel immediately across remounts', () => {
    const first = render(<ShareModal frames={[frame(101)]} onClose={() => {}} />);
    fireEvent.click(first.getByRole('button', { name: 'Reel' }));
    expect(first.getByTestId('reel-player')).toHaveAttribute('data-seed', '0');
    first.unmount();

    const second = render(<ShareModal frames={[frame(101)]} onClose={() => {}} />);
    fireEvent.click(second.getByRole('button', { name: 'Reel' }));
    expect(second.getByTestId('reel-player')).toHaveAttribute('data-seed', '0');
  });

  it('never starts a silent or partially voiced Reel export', async () => {
    renderReelAudioSpy.mockResolvedValue({
      buffer: null,
      timings: [8000],
      missing: 1,
      firstMissingLine: 'Plants turn light into sugar.',
    });
    const view = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    fireEvent.click(view.getByRole('button', { name: 'Reel' }));
    fireEvent.click(view.getByRole('button', { name: /Download/ }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plants turn light into sugar.'),
        'warn',
      ),
    );
    expect(startStoryRecordingSpy).not.toHaveBeenCalled();
    // The reason outlives its toast, in the same live region that carries the render phases.
    expect(view.getByRole('status')).toHaveTextContent('Narration is unavailable');
  });

  it('quietly releases a reel when the native share sheet is dismissed', async () => {
    const dispose = vi.fn(async () => {});
    const onShared = vi.fn();
    renderReelAudioSpy.mockResolvedValue({
      buffer: {} as AudioBuffer,
      timings: [8_000],
      missing: 0,
    });
    startStoryRecordingSpy.mockResolvedValue({
      cancel: vi.fn(),
      stop: vi.fn(async () => ({
        blob: new Blob(['video'], { type: 'video/webm' }),
        type: 'video/webm',
        poster: new Blob(),
        hasAudio: true,
        durationMs: 8_000,
        dispose,
      })),
    });
    shareClipSpy.mockResolvedValue('cancelled');

    const view = render(<ShareModal frames={[frame()]} onClose={() => {}} onShared={onShared} />);
    fireEvent.click(view.getByRole('button', { name: 'Reel' }));
    fireEvent.click(view.getByRole('button', { name: /Share$/ }));
    await waitFor(() => expect(startStoryRecordingSpy).toHaveBeenCalledOnce());
    fireEvent.click(await view.findByRole('button', { name: 'Finish reel recording' }));
    await waitFor(() => expect(shareClipSpy).toHaveBeenCalledOnce());

    expect(onShared).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
