import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { Scrubber } from '../src/live/scrubber/Scrubber';
import { Overview } from '../src/live/scrubber/Overview';
import type { Chapter } from '../src/live/scrubber/chapters';

const CHAPTERS: Chapter[] = [
  {
    id: 'ch-0',
    title: 'Tokyo Itinerary',
    color: 'var(--presence)',
    moments: [
      {
        frameIndex: 0,
        question: 'Plan three days in Tokyo',
        icon: 'mic',
        mode: 'replace',
        elements: [
          { id: 'blk-map', label: 'Neighbourhood map', icon: 'globe' },
          { id: 'blk-days', label: 'Day-by-day plan', icon: 'clock' },
        ],
      },
      { frameIndex: 1, question: 'Add a food day', icon: 'sparkle', mode: 'augment', elements: [] },
    ],
  },
  {
    id: 'ch-2',
    title: 'Monthly Budget',
    color: 'var(--insight)',
    moments: [
      {
        frameIndex: 2,
        question: 'How should I budget $5,000',
        icon: 'check',
        mode: 'replace',
        elements: [{ id: 'blk-split', label: 'Spending split', icon: 'chart' }],
      },
    ],
  },
];

afterEach(cleanup);

describe('Scrubber', () => {
  it('renders one track per chapter and one tick per moment', () => {
    const { container } = render(
      <Scrubber chapters={CHAPTERS} currentIndex={1} onJump={() => {}} onOpenOverview={() => {}} />,
    );
    expect(container.querySelectorAll('.scrub-track')).toHaveLength(2);
    expect(container.querySelectorAll('.scrub-tick')).toHaveLength(3);
    expect(container.querySelectorAll('.scrub-label')[0].textContent).toBe('Tokyo Itinerary');
  });

  it('glows the tick on screen and jumps when a tick is clicked', () => {
    const onJump = vi.fn();
    const { container } = render(
      <Scrubber chapters={CHAPTERS} currentIndex={1} onJump={onJump} onOpenOverview={() => {}} />,
    );
    const current = container.querySelector('.scrub-tick.is-current');
    expect(current?.getAttribute('aria-label')).toBe('Add a food day');
    fireEvent.click(container.querySelectorAll('.scrub-tick')[2]);
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('opens the overview from the layers button', () => {
    const onOpenOverview = vi.fn();
    const { container } = render(
      <Scrubber
        chapters={CHAPTERS}
        currentIndex={0}
        onJump={() => {}}
        onOpenOverview={onOpenOverview}
      />,
    );
    fireEvent.click(container.querySelector('.scrub-layers')!);
    expect(onOpenOverview).toHaveBeenCalledTimes(1);
  });

  it('renders nothing on an empty conversation', () => {
    const { container } = render(
      <Scrubber chapters={[]} currentIndex={0} onJump={() => {}} onOpenOverview={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('Overview', () => {
  it('shows the real chapter + moment counts', () => {
    render(<Overview chapters={CHAPTERS} currentIndex={2} onJump={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/2 chapters · 3 moments/)).toBeTruthy();
    expect(document.querySelectorAll('.ovw-card')).toHaveLength(2);
  });

  it('marks the current moment and dives in on click', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(<Overview chapters={CHAPTERS} currentIndex={2} onJump={onJump} onClose={onClose} />);
    const current = document.querySelector('.ovw-moment.is-current');
    expect(current?.textContent).toContain('How should I budget $5,000');
    fireEvent.click(current!);
    // a moment jump names no element — the whole turn, not a specific block
    expect(onJump).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("breaks a moment down into its answer's elements as a nested sub-list", () => {
    render(<Overview chapters={CHAPTERS} currentIndex={0} onJump={() => {}} onClose={() => {}} />);
    const firstMomentEls = document
      .querySelectorAll('.ovw-moments > li')[0]
      .querySelectorAll('.ovw-el');
    expect(firstMomentEls).toHaveLength(2);
    expect(firstMomentEls[0].textContent).toContain('Neighbourhood map');
    expect(firstMomentEls[1].textContent).toContain('Day-by-day plan');
    // a moment with no navigable blocks shows no sub-list
    expect(document.querySelectorAll('.ovw-moments > li')[1].querySelector('.ovw-els')).toBeNull();
  });

  it('jumps straight to a specific element (frame index AND block id) and closes', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(<Overview chapters={CHAPTERS} currentIndex={0} onJump={onJump} onClose={onClose} />);
    const dayPlan = screen.getByRole('button', {
      name: 'Jump to "Day-by-day plan" in "Plan three days in Tokyo"',
    });
    fireEvent.click(dayPlan);
    expect(onJump).toHaveBeenCalledWith(0, 'blk-days');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on a backdrop click', () => {
    const onClose = vi.fn();
    render(<Overview chapters={CHAPTERS} currentIndex={0} onJump={() => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.ovw-scrim')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing on an empty conversation', () => {
    const { container } = render(
      <Overview chapters={[]} currentIndex={0} onJump={() => {}} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    expect(document.querySelector('.ovw-scrim')).toBeNull();
  });
});
