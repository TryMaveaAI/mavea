import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TurnFrame } from '../src/live/history';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  exportVideo: vi.fn(),
  download: vi.fn(),
  share: vi.fn(),
}));

vi.mock('../src/clip/conversation/ConversationStage', () => ({
  ConversationStage: ({
    scene,
    frameRef,
  }: {
    scene: { frame: TurnFrame; questionOnly: boolean } | null;
    frameRef?: (element: HTMLDivElement | null) => void;
  }) => (
    <div
      ref={frameRef}
      data-testid="conversation-preview"
      data-question-only={scene?.questionOnly ?? false}
    >
      {scene?.frame.question}
    </div>
  ),
}));
vi.mock('../src/clip/conversation/audio', () => ({
  RequiredConversationAudioError: class extends Error {},
  prepareConversationAudio: mocks.prepare,
}));
vi.mock('../src/clip/conversation/capture', () => ({
  conversationCaptureSupported: () => true,
  exportConversationVideo: mocks.exportVideo,
  CONVERSATION_DIMENSIONS: {
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 },
  },
}));
// Only the two side-effecting exits are spied; the naming helpers stay real so the file name a
// user actually gets is covered here rather than asserted against a stub of itself.
vi.mock('../src/clip/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/clip/share')>()),
  downloadClip: mocks.download,
  shareClip: mocks.share,
}));

import { ConversationVideoStudio } from '../src/clip/conversation/ConversationVideoStudio';

function frame(index: number, mode: TurnFrame['mode'] = 'augment'): TurnFrame {
  return {
    id: `turn-${index}`,
    question: `Question ${index}`,
    narration: `Narration for turn ${index}.`,
    mode,
    topicShift: index === 0,
    tour: [],
    spec: { title: `Answer ${index}`, blocks: [] } as never,
    at: new Date(2026, 0, 1, 9, index).getTime(),
  };
}

const frames = [frame(0, 'replace'), frame(1), frame(2)];

const realMatchMedia = window.matchMedia;
/** jsdom answers every query the same way, so stub it to speak for the reduced-motion query only. */
function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

async function exportedClip() {
  mocks.prepare.mockResolvedValue({
    buffer: {} as AudioBuffer,
    turns: [{ durationMs: 2_000, spans: [] }],
    durationMs: 2_000,
  });
  mocks.exportVideo.mockResolvedValue({
    blob: new Blob(['video'], { type: 'video/webm' }),
    type: 'video/webm',
    poster: new Blob(),
    hasAudio: true,
    durationMs: 2_000,
    width: 1920,
    height: 1080,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create 1080p video' }));
  await screen.findByRole('button', { name: '↓ Download video' });
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ConversationVideoStudio', () => {
  it('opens on the current turn with mandatory audio and 1080p creation', () => {
    render(<ConversationVideoStudio frames={frames} />);
    const checks = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checks.map((input) => input.checked)).toEqual([false, false, true]);
    expect(screen.getByText('● Audio always on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 1080p video' })).toBeEnabled();
    expect(screen.getByTestId('conversation-preview')).toHaveTextContent('Question 2');
  });

  it('selects all turns chronologically and independently toggles optional visuals', () => {
    render(<ConversationVideoStudio frames={frames} />);
    fireEvent.click(screen.getByRole('button', { name: 'All turns' }));
    expect(
      (screen.getAllByRole('checkbox') as HTMLInputElement[]).map((input) => input.checked),
    ).toEqual([true, true, true]);

    const pen = screen.getByRole('button', { name: 'Pen marks' });
    expect(pen).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pen);
    expect(pen).toHaveAttribute('aria-pressed', 'false');
    // Selection is exposed, not just styled — a screen reader hears which size and quality is on.
    expect(screen.getByRole('button', { name: '1080p' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '720p' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Conversation turns' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Story' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Square' })).not.toBeInTheDocument();
  });

  it('plays the preview through the scene timeline instead of parking on the question beat', async () => {
    vi.useFakeTimers();
    try {
      render(<ConversationVideoStudio frames={frames} />);
      const preview = screen.getByTestId('conversation-preview');
      expect(preview).toHaveAttribute('data-question-only', 'true');
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(preview).toHaveAttribute('data-question-only', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('prepares complete audio before encoding and exposes a separate download artifact', async () => {
    const audio = {
      buffer: {} as AudioBuffer,
      turns: [{ durationMs: 2_000, spans: [] }],
      durationMs: 2_000,
    };
    const result = {
      blob: new Blob(['video'], { type: 'video/webm' }),
      type: 'video/webm',
      poster: new Blob(),
      hasAudio: true,
      durationMs: 2_000,
      width: 1920,
      height: 1080,
    };
    mocks.prepare.mockResolvedValue(audio);
    mocks.exportVideo.mockResolvedValue(result);

    render(<ConversationVideoStudio frames={frames} retainedAudio={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create 1080p video' }));

    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
    expect(mocks.exportVideo).toHaveBeenCalledWith(
      expect.objectContaining({ audioBuffer: audio.buffer, size: '1080p', quality: 'high' }),
    );
    const download = await screen.findByRole('button', { name: '↓ Download video' });
    expect(screen.getByText('Ready · 1920×1080')).toBeInTheDocument();
    // One ready box, not two — the result card is the whole announcement.
    expect(screen.queryByText('Video ready')).not.toBeInTheDocument();
    fireEvent.click(download);
    // Named for the conversation and dated, so it is still identifiable in a downloads folder.
    expect(mocks.download).toHaveBeenCalledWith(
      result.blob,
      expect.stringMatching(/^mavea-answer-2-\d{4}-\d{2}-\d{2}\.webm$/),
      expect.any(Function),
    );
    // Handing the blob over consumes it: no card left offering a second download of a freed file.
    expect(screen.queryByText('Ready · 1920×1080')).not.toBeInTheDocument();
  });

  it('starts the export even when the window is occluded and rAF never fires', async () => {
    // An occluded tab stops servicing requestAnimationFrame entirely. The export used to await two
    // bare frames before anything watched the abort signal, so it hung on "Preparing required
    // narration…" behind a Cancel button that could not cancel it.
    const starved = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    try {
      mocks.prepare.mockResolvedValue({
        buffer: {} as AudioBuffer,
        turns: [{ durationMs: 2_000, spans: [] }],
        durationMs: 2_000,
      });
      mocks.exportVideo.mockResolvedValue({
        blob: new Blob(['video'], { type: 'video/webm' }),
        type: 'video/webm',
        poster: new Blob(),
        hasAudio: true,
        durationMs: 2_000,
        width: 1920,
        height: 1080,
      });

      render(<ConversationVideoStudio frames={frames} retainedAudio={() => null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Create 1080p video' }));

      await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
      await screen.findByRole('button', { name: '↓ Download video' });
    } finally {
      starved.mockRestore();
    }
  });

  it('explains the pause when the window goes to the background mid-render', async () => {
    // The recorder holds the scene timeline until the window can paint again. Left unexplained,
    // that reads as a frozen export rather than a pause the user can end by switching back.
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      mocks.prepare.mockResolvedValue({
        buffer: {} as AudioBuffer,
        turns: [{ durationMs: 2_000, spans: [] }],
        durationMs: 2_000,
      });
      mocks.exportVideo.mockReturnValue(new Promise(() => {}));

      render(<ConversationVideoStudio frames={frames} retainedAudio={() => null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Create 1080p video' }));

      expect(
        await screen.findByText(/Paused while this window is in the background/),
      ).toBeVisible();

      visibility.mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
      await waitFor(() =>
        expect(
          screen.queryByText(/Paused while this window is in the background/),
        ).not.toBeInTheDocument(),
      );
    } finally {
      visibility.mockRestore();
    }
  });

  it('drops a finished video, and its status, the moment a setting changes it', async () => {
    render(<ConversationVideoStudio frames={frames} retainedAudio={() => null} />);
    await exportedClip();

    fireEvent.click(screen.getByRole('button', { name: '720p' }));
    expect(screen.queryByText('Ready · 1920×1080')).not.toBeInTheDocument();
    expect(screen.queryByText('Video ready')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 720p video' })).toBeEnabled();
  });

  it('keeps a finished video available when the native share sheet is dismissed', async () => {
    const onShared = vi.fn();
    mocks.share.mockResolvedValue('cancelled');
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), { share: vi.fn(async () => {}) }),
    );
    render(
      <ConversationVideoStudio frames={frames} retainedAudio={() => null} onShared={onShared} />,
    );
    await exportedClip();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(mocks.share).toHaveBeenCalledOnce());

    expect(onShared).not.toHaveBeenCalled();
    expect(screen.getByText('Ready · 1920×1080')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↓ Download video' })).toBeEnabled();
  });

  it('pauses and resumes the preview loop', async () => {
    vi.useFakeTimers();
    try {
      render(<ConversationVideoStudio frames={frames} />);
      const preview = screen.getByTestId('conversation-preview');
      fireEvent.click(screen.getByRole('button', { name: 'Pause preview' }));
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });
      expect(preview).toHaveAttribute('data-question-only', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(preview).toHaveAttribute('data-question-only', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds a real content beat under reduced motion instead of looping', async () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    try {
      render(<ConversationVideoStudio frames={frames} />);
      const preview = screen.getByTestId('conversation-preview');
      // Not the dimmed question beat: the still has to read as the actual cut.
      expect(preview).toHaveAttribute('data-question-only', 'false');
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });
      expect(preview).toHaveAttribute('data-question-only', 'false');
      // Nothing moves, so there is nothing to pause.
      expect(screen.queryByRole('button', { name: 'Pause preview' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
