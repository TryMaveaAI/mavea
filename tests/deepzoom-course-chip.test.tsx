// deepzoom-course-chip.test.tsx — the "Turn this into a course" one-way navigation chip: once
// a real topic is loaded, DeepZoomApp's top bar stashes it (courseSeed.ts's stashCourseTopic,
// the SAME handoff CoursesApp reads to auto-generate) and routes to #/courses. This is a simple
// navigation hop, never an embedded course surface — see course-coursesapp.test.tsx for what
// happens on the receiving end.
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { ZoomLevel } from '../src/live/deepzoom/types';

vi.mock('../src/live/deepzoom/generate', () => ({
  BRANCH_DEPTH: 10,
  generateTrunk: vi.fn(),
  generateBranch: vi.fn(),
}));

import { generateTrunk } from '../src/live/deepzoom/generate';
import { DeepZoomApp } from '../src/live/deepzoom/DeepZoomApp';

const mockGenerateTrunk = vi.mocked(generateTrunk);

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
  window.location.hash = '';
  sessionStorage.clear();
});

describe('DeepZoom — "Turn this into a course" chip', () => {
  it('is absent before a topic has loaded (start screen)', () => {
    render(<DeepZoomApp />);
    expect(screen.queryByRole('button', { name: /Turn this into a course/i })).toBeNull();
  });

  it('stashes the loaded topic and routes to #/courses once a topic is loaded', async () => {
    mockGenerateTrunk.mockResolvedValue({ rangeStart: 'all things', levels: trunkLevels });
    render(<DeepZoomApp />);

    fireEvent.change(screen.getByPlaceholderText('how does my body make energy?'), {
      target: { value: 'how does my body make energy?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await screen.findByRole('heading', { name: 'Level A' });

    fireEvent.click(screen.getByRole('button', { name: /Turn this into a course/i }));

    expect(window.location.hash).toBe('#/courses');
    expect(sessionStorage.getItem('mavea-course-topic-seed')).toBe('how does my body make energy?');
  });
});
