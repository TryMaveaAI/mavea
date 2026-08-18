import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import type { TurnFrame } from '../src/live/history';

const { renderReelAudioSpy, downloadClipSpy, startStoryRecordingSpy, toastSpy } = vi.hoisted(
  () => ({
    renderReelAudioSpy: vi.fn(),
    downloadClipSpy: vi.fn(),
    startStoryRecordingSpy: vi.fn(),
    toastSpy: vi.fn(),
  }),
);

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
  downloadClip: downloadClipSpy,
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
    downloadClipSpy.mockReset();
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

  it('downloads the finished reel from the single primary action', async () => {
    const blob = new Blob(['video'], { type: 'video/webm' });
    const onShared = vi.fn();
    renderReelAudioSpy.mockResolvedValue({
      buffer: {} as AudioBuffer,
      timings: [8_000],
      missing: 0,
    });
    startStoryRecordingSpy.mockResolvedValue({
      cancel: vi.fn(),
      stop: vi.fn(async () => ({
        blob,
        type: 'video/webm',
        poster: new Blob(),
        hasAudio: true,
        durationMs: 8_000,
        dispose: vi.fn(async () => {}),
      })),
    });

    const view = render(<ShareModal frames={[frame()]} onClose={() => {}} onShared={onShared} />);
    fireEvent.click(view.getByRole('button', { name: 'Reel' }));
    // Download is the one exit — the Share button was removed (desktop browsers expose
    // navigator.share but refuse file payloads, so it only ever pretended).
    expect(view.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(startStoryRecordingSpy).toHaveBeenCalledOnce());
    fireEvent.click(await view.findByRole('button', { name: 'Finish reel recording' }));
    await waitFor(() => expect(downloadClipSpy).toHaveBeenCalledOnce());

    expect(downloadClipSpy).toHaveBeenCalledWith(blob, undefined, expect.any(Function));
    expect(toastSpy).toHaveBeenCalledWith('Saved to your downloads', 'good');
    expect(onShared).toHaveBeenCalledOnce();
  });

  it('lands focus inside on a warm re-open so Escape still closes', async () => {
    // Second open: the lazy studio chunk is cached, so it mounts synchronously and any initial
    // focus target it exposes exists before the trap runs — the shape that once left focus on the
    // trigger outside the dialog, where the Escape listener could never hear the key.
    const first = render(<ShareModal frames={[frame()]} onClose={() => {}} />);
    await first.findByTestId('conversation-studio');
    first.unmount();

    const onClose = vi.fn();
    const second = render(<ShareModal frames={[frame()]} onClose={onClose} />);
    await second.findByTestId('conversation-studio');
    const dialog = second.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to a real control when the named initial focus target refuses focus', () => {
    // Reel-only mode names the preview frame as initial focus; the stubbed player renders it as a
    // plain (non-focusable) div, exercising the trap's verify-and-fall-back path directly.
    const script = {
      palette: 'aurora',
      seed: 0,
      slides: [{ content: 'title' }],
      durationMs: 8_000,
    } as never;
    const onClose = vi.fn();
    const { getByRole } = render(<ShareModal script={script} onClose={onClose} />);
    const dialog = getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
