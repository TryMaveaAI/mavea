// Deep Zoom opened from Live carries the conversation topic as a SEED, not an auto-run: the start
// screen opens pre-filled so the reader chooses to telescope it or ask about something else. And a
// running session can always start a fresh zoom via the "New" button.
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { ZoomLevel } from '../src/live/deepzoom/types';

vi.mock('../src/live/deepzoom/generate', () => ({
  BRANCH_DEPTH: 10,
  generateTrunk: vi.fn(),
  generateBranch: vi.fn(),
}));

import { generateTrunk, generateBranch } from '../src/live/deepzoom/generate';
import { DeepZoomApp } from '../src/live/deepzoom/DeepZoomApp';
import { stashZoomTopic, takeZoomTopic } from '../src/live/course/courseSeed';

const mockGenerateTrunk = vi.mocked(generateTrunk);
const mockGenerateBranch = vi.mocked(generateBranch);

const trunkLevels: ZoomLevel[] = [
  {
    scale: 0,
    multiplier: '×1',
    scaleLabel: 'THE FIELD',
    title: 'Level A',
    body: 'Body A.',
    subtopics: ['Sub A1', 'Sub A2'],
    selectedIndex: 0,
  },
];

afterEach(() => {
  cleanup();
  mockGenerateTrunk.mockClear();
  mockGenerateBranch.mockClear();
  window.location.hash = '';
});

describe('DeepZoom — ?q= from a link', () => {
  it('pre-fills the start screen without running, so a link cannot spend the key', () => {
    window.location.hash = '#/deepzoom?q=' + encodeURIComponent('black holes');
    render(<DeepZoomApp />);

    const input = screen.getByPlaceholderText('how does my body make energy?') as HTMLInputElement;
    expect(input.value).toBe('black holes');
    expect(screen.getByText(/opened from a link/i)).toBeInTheDocument();
    expect(mockGenerateTrunk).not.toHaveBeenCalled();
  });

  it('runs a ?q= the app vouched for, once', async () => {
    mockGenerateTrunk.mockResolvedValue({ rangeStart: 'all things', levels: trunkLevels });
    stashZoomTopic('black holes');
    window.location.hash = '#/deepzoom?q=' + encodeURIComponent('black holes');
    render(<DeepZoomApp />);

    await screen.findByRole('heading', { name: 'Level A' });
    expect(mockGenerateTrunk).toHaveBeenCalledWith(
      'black holes',
      expect.anything(),
      expect.anything(),
    );
    // Consumed on the way in: a reload of the same URL is a link again.
    expect(takeZoomTopic()).toBeUndefined();
  });

  it('ignores a stash for a different topic', () => {
    stashZoomTopic('quasars');
    window.location.hash = '#/deepzoom?q=' + encodeURIComponent('black holes');
    render(<DeepZoomApp />);

    expect(mockGenerateTrunk).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText('how does my body make energy?') as HTMLInputElement;
    expect(input.value).toBe('black holes');
  });

  it('pre-fills, not runs, when the hash changes to an unvouched ?q= after mount', async () => {
    window.location.hash = '#/deepzoom';
    render(<DeepZoomApp />);

    window.location.hash = '#/deepzoom?q=' + encodeURIComponent('black holes');
    fireEvent(window, new HashChangeEvent('hashchange'));

    await waitFor(() => {
      const input = screen.getByPlaceholderText(
        'how does my body make energy?',
      ) as HTMLInputElement;
      expect(input.value).toBe('black holes');
    });
    expect(mockGenerateTrunk).not.toHaveBeenCalled();
  });
});

describe('DeepZoom — seed + new', () => {
  it('pre-fills the start screen from ?seed= without auto-zooming', () => {
    window.location.hash = '#/deepzoom?seed=' + encodeURIComponent('a trip to Chicago');
    render(<DeepZoomApp />);

    const input = screen.getByPlaceholderText('how does my body make energy?') as HTMLInputElement;
    expect(input.value).toBe('a trip to Chicago');
    // The carry-over hint is shown, and nothing was generated — the reader is in control.
    expect(screen.getByText(/carried over from your conversation/i)).toBeInTheDocument();
    expect(mockGenerateTrunk).not.toHaveBeenCalled();
  });

  it('zooms the seeded topic only when the reader submits it', async () => {
    mockGenerateTrunk.mockResolvedValue({ rangeStart: 'all things', levels: trunkLevels });
    window.location.hash = '#/deepzoom?seed=' + encodeURIComponent('a trip to Chicago');
    render(<DeepZoomApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await screen.findByRole('heading', { name: 'Level A' });
    expect(mockGenerateTrunk).toHaveBeenCalledWith(
      'a trip to Chicago',
      expect.anything(),
      expect.anything(),
    );
  });

  it('offers a "New" button in a session that returns to an empty start screen', async () => {
    mockGenerateTrunk.mockResolvedValue({ rangeStart: 'all things', levels: trunkLevels });
    render(<DeepZoomApp />);

    fireEvent.change(screen.getByPlaceholderText('how does my body make energy?'), {
      target: { value: 'photosynthesis' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await screen.findByRole('heading', { name: 'Level A' });

    fireEvent.click(screen.getByRole('button', { name: /start a new deep zoom/i }));
    // Back on the start screen, empty — ready for a different topic.
    await waitFor(() => {
      const input = screen.getByPlaceholderText(
        'how does my body make energy?',
      ) as HTMLInputElement;
      expect(input.value).toBe('');
    });
    expect(window.location.hash).toBe('#/deepzoom');
  });
});
