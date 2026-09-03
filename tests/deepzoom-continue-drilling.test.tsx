// Regression: reaching the last of the 10 generated zoom levels must still let you keep
// drilling in (one more API call forks 10 deeper levels) — it must never dead-end with a
// "finest level reached" message while subtopics (and thus somewhere finer to go) exist.
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { ZoomLevel } from '../src/live/deepzoom/types';

vi.mock('../src/live/deepzoom/generate', () => ({
  BRANCH_DEPTH: 10,
  generateTrunk: vi.fn(),
  generateBranch: vi.fn(),
}));

import { generateTrunk, generateBranch } from '../src/live/deepzoom/generate';
import { DeepZoomApp } from '../src/live/deepzoom/DeepZoomApp';
import { DEEPZOOM_DEMO_TREE } from '../src/live/deepzoom/demoTree';

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
  {
    scale: 1,
    multiplier: '×10',
    scaleLabel: 'THE AREA',
    title: 'Level B',
    body: 'Body B.',
    subtopics: ['Sub B1', 'Sub B2'],
    selectedIndex: 0,
  },
  {
    scale: 2,
    multiplier: '×100',
    scaleLabel: 'THE DETAIL',
    title: 'Level C',
    body: 'Body C.',
    subtopics: ['Sub C1', 'Sub C2'],
    selectedIndex: 0,
  },
];

const branchLevels: ZoomLevel[] = [
  {
    scale: 3,
    multiplier: '×1k',
    scaleLabel: 'THE MECHANISM',
    title: 'Level D',
    body: 'Body D.',
    subtopics: ['Sub D1'],
    selectedIndex: 0,
  },
];

afterEach(() => {
  cleanup();
  mockGenerateTrunk.mockClear();
  mockGenerateBranch.mockClear();
  window.location.hash = '';
});

describe('DeepZoom — drilling past the generated frontier', () => {
  it('keeps the zoom-in control live at the last level instead of dead-ending', async () => {
    mockGenerateTrunk.mockResolvedValue({ rangeStart: 'all things', levels: trunkLevels });
    mockGenerateBranch.mockResolvedValue(branchLevels);

    render(<DeepZoomApp />);

    fireEvent.change(screen.getByPlaceholderText('how does my body make energy?'), {
      target: { value: 'test topic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    await screen.findByRole('heading', { name: 'Level A' });

    // Page through the pre-generated trunk to its last card (free — already loaded). Each level's
    // "Zoom into <selected subtopic>" advances along the trunk when that subtopic matches the
    // pre-generated child (A --Sub A1--> B --Sub B1--> C); only the frontier forks a new branch.
    fireEvent.click(screen.getByRole('button', { name: /zoom into sub a1/i }));
    await screen.findByRole('heading', { name: 'Level B' });
    fireEvent.click(screen.getByRole('button', { name: /zoom into sub b1/i }));
    await screen.findByRole('heading', { name: 'Level C' });

    // Regression: this used to render a dead "finest level reached" label here and hide the
    // per-card zoom control, permanently capping every walk at the first generated batch.
    expect(screen.queryByText(/finest level reached/i)).not.toBeInTheDocument();
    const zoomIntoNext = screen.getByRole('button', { name: /zoom into sub c1/i });

    fireEvent.click(zoomIntoNext);
    await screen.findByRole('heading', { name: 'Level D' });
    expect(mockGenerateBranch).toHaveBeenCalledTimes(1);
    expect(mockGenerateBranch.mock.calls[0]?.[2]).toBe('Sub C1');
  });

  it('does not generate a new branch past the canned demo frontier', async () => {
    window.location.hash = '#/deepzoom?demo=1';
    render(<DeepZoomApp />);

    await screen.findByRole('heading', {
      name: DEEPZOOM_DEMO_TREE.nodes.find((node) => node.id === DEEPZOOM_DEMO_TREE.trunkIds[0])!
        .level.title,
    });
    for (let i = 1; i < DEEPZOOM_DEMO_TREE.trunkIds.length; i += 1) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: ' ' });

    expect(mockGenerateBranch).not.toHaveBeenCalled();
  });

  it('says the sample stops here rather than offering a live button that ignores you', async () => {
    // 20 of the walkthrough's 27 chips fork somewhere the demo tree was never authored for, and the
    // press was dropped in silence: the chip visibly selected, the CTA rewrote itself to name it,
    // and clicking did nothing at all — the frontier's own default chip included.
    window.location.hash = '#/deepzoom?demo=1';
    render(<DeepZoomApp />);
    await screen.findByRole('heading', { name: 'A plant, quietly eating light' });

    const zoom = (): HTMLButtonElement =>
      screen.getByRole('button', { name: /^Zoom into/ }) as HTMLButtonElement;
    expect(zoom().disabled).toBe(false); // the authored path is still live

    fireEvent.click(screen.getByRole('button', { name: 'The roots' }));
    expect(zoom()).toHaveAccessibleName('Zoom into The roots');
    expect(zoom().disabled).toBe(true);
    expect(screen.getByText(/sample descends one path/i)).toBeInTheDocument();
  });

  it('leaves Space to whatever button has focus', async () => {
    // The window handler took Space unconditionally and preventDefault()ed it, so pressing Space on
    // the theme toggle — or on a chip, or on Back — zoomed a level instead of doing its own job.
    window.location.hash = '#/deepzoom?demo=1';
    render(<DeepZoomApp />);
    await screen.findByRole('heading', { name: 'A plant, quietly eating light' });

    const chip = screen.getByRole('button', { name: 'The roots' });
    chip.focus();
    fireEvent.keyDown(chip, { key: ' ', bubbles: true });

    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName(
      'A plant, quietly eating light',
    );
  });
});
