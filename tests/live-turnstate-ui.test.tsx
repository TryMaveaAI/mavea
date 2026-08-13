import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ListeningCard } from '../src/live/turnstate/ListeningCard';
import { WorkingSkeletons } from '../src/live/turnstate/WorkingSkeletons';
import { TurnActivityChips } from '../src/live/turnstate/TurnActivityChips';
import { SpeakingDock } from '../src/live/turnstate/SpeakingDock';

describe('ListeningCard', () => {
  it('shows the forming transcript with a caret and a mode-honest caption', () => {
    const { getByText, container } = render(
      <ListeningCard transcript="should I flex Nabers or" mode="tap" />,
    );
    expect(getByText(/should I flex Nabers or/)).toBeTruthy();
    expect(container.querySelector('.listen-caret')).toBeTruthy();
    expect(getByText(/It sends when you pause/)).toBeTruthy();
  });

  it('is honest about the always-on mic', () => {
    const { getByText } = render(<ListeningCard transcript={null} mode="always" />);
    expect(getByText(/Listening/)).toBeTruthy();
    expect(getByText(/Always on/)).toBeTruthy();
  });

  // The interim transcript mutates on every recognized word; announcing it would read the
  // speaker's own words back at them while they are still talking. Only the caption is live.
  it('keeps the streaming transcript out of the live region', () => {
    const { container } = render(<ListeningCard transcript="should I flex" mode="tap" />);
    const live = container.querySelector('[aria-live]');
    expect(live).toBeTruthy();
    expect(live).toHaveClass('listen-note');
    expect(container.querySelector('.listen-line')?.closest('[aria-live]')).toBeNull();
  });
});

describe('WorkingSkeletons', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits a beat before appearing, so cached turns never flash skeletons', () => {
    const { container } = render(
      <WorkingSkeletons cards={[{ label: 'Finding — refi math', lines: [78, 52] }]} />,
    );
    expect(container.querySelector('.skel-card')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector('.skel-card')).toBeTruthy();
    expect(container.querySelector('.skel-eyebrow')?.textContent).toContain('Finding — refi math');
    expect(container.querySelectorAll('.skel-line').length).toBe(2);
  });

  it('renders nothing for an empty plan', () => {
    const { container } = render(<WorkingSkeletons cards={[]} />);
    act(() => vi.advanceTimersByTime(300));
    expect(container.firstChild).toBeNull();
  });
});

describe('TurnActivityChips', () => {
  it('names the real sources being read once the search resolves', () => {
    const { getByText, queryByText } = render(
      <TurnActivityChips
        activity="searching"
        sources={[
          { title: 'Open Compute', url: 'https://www.opencompute.org/a' },
          { title: 'Papers', url: 'https://arxiv.org/abs/1' },
        ]}
      />,
    );
    expect(getByText('opencompute.org')).toBeTruthy();
    expect(getByText('arxiv.org')).toBeTruthy();
    // The generic pill yields to the named sources.
    expect(queryByText(/Searching the web/)).toBeNull();
  });

  it('shows the generic searching pill before sources are known', () => {
    const { getByText } = render(<TurnActivityChips activity="searching" sources={[]} />);
    expect(getByText(/Searching the web/)).toBeTruthy();
  });

  it('renders nothing when idle', () => {
    const { container } = render(<TurnActivityChips activity={null} sources={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SpeakingDock', () => {
  it('rides the dock as an in-flow strip, never a floating overlay', () => {
    const { container } = render(
      <SpeakingDock
        line="Up 2.4% at $1,284 — most of it in the final hour."
        speaking={true}
        captions={true}
        onInterrupt={() => {}}
      />,
    );
    expect(container.querySelector('.speak-strip')).toBeTruthy();
    expect(container.querySelector('.speak-dock')).toBeNull();
  });

  it('shows the pill regardless of captions, and the ribbon only when captions are on', () => {
    const onInterrupt = vi.fn();
    const withCaptions = render(
      <SpeakingDock
        line="Up 2.4% at $1,284 — most of it in the final hour."
        speaking={true}
        captions={true}
        onInterrupt={onInterrupt}
      />,
    );
    expect(withCaptions.container.querySelector('.speak-ribbon')).toBeTruthy();
    // The figures carry highlight marks inside their phrases.
    expect(withCaptions.container.querySelectorAll('.hero-accent').length).toBeGreaterThan(0);
    fireEvent.click(withCaptions.getByRole('button', { name: /tap to interrupt/i }));
    expect(onInterrupt).toHaveBeenCalled();
    withCaptions.unmount();

    const withoutCaptions = render(
      <SpeakingDock
        line="Up 2.4% at $1,284 — most of it in the final hour."
        speaking={true}
        captions={false}
        onInterrupt={() => {}}
      />,
    );
    expect(withoutCaptions.container.querySelector('.speak-ribbon')).toBeNull();
    expect(withoutCaptions.container.querySelector('.speak-pill')).toBeTruthy();
  });

  it('renders nothing when the voice is silent or there is no line', () => {
    const a = render(
      <SpeakingDock line="A line." speaking={false} captions={true} onInterrupt={() => {}} />,
    );
    expect(a.container.firstChild).toBeNull();
    const b = render(
      <SpeakingDock line={null} speaking={true} captions={true} onInterrupt={() => {}} />,
    );
    expect(b.container.firstChild).toBeNull();
  });

  it('lingers through a brief speaking gap, then unmounts', () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(
        <SpeakingDock
          line="First the setup, then the punchline arrives, and finally the close."
          speaking={true}
          captions={true}
          onInterrupt={() => {}}
        />,
      );
      expect(container.querySelector('.speak-strip')).toBeTruthy();
      rerender(
        <SpeakingDock
          line="First the setup, then the punchline arrives, and finally the close."
          speaking={false}
          captions={true}
          onInterrupt={() => {}}
        />,
      );
      // Still mounted through the linger window — a tour's stop-to-stop gap can't bounce it.
      expect(container.querySelector('.speak-strip')).toBeTruthy();
      act(() => vi.advanceTimersByTime(650));
      expect(container.querySelector('.speak-strip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lights phrases as the clock advances', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <SpeakingDock
          line="First the setup, then the punchline arrives, and finally the close."
          speaking={true}
          captions={true}
          onInterrupt={() => {}}
        />,
      );
      const lit = () => container.querySelectorAll('.speak-phrase.said').length;
      const initial = lit();
      act(() => vi.advanceTimersByTime(6000));
      expect(lit()).toBeGreaterThanOrEqual(initial);
      expect(lit()).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the idle fallback once there is nothing left to say (and after the linger)', () => {
    vi.useFakeTimers();
    try {
      const idle = <div className="my-idle">Mavéa</div>;
      // Never spoken at all — no linger to wait out.
      const never = render(
        <SpeakingDock
          line={null}
          speaking={false}
          captions={true}
          onInterrupt={() => {}}
          idle={idle}
        />,
      );
      expect(never.container.querySelector('.my-idle')).toBeTruthy();
      expect(never.container.querySelector('.speak-strip')).toBeNull();

      // Was speaking, then stopped — idle must wait for the same linger the pill gets, not
      // replace it instantly (that would cut the fade the linger exists to provide).
      const { container, rerender } = render(
        <SpeakingDock
          line="A line."
          speaking={true}
          captions={true}
          onInterrupt={() => {}}
          idle={idle}
        />,
      );
      expect(container.querySelector('.speak-strip')).toBeTruthy();
      expect(container.querySelector('.my-idle')).toBeNull();
      rerender(
        <SpeakingDock
          line="A line."
          speaking={false}
          captions={true}
          onInterrupt={() => {}}
          idle={idle}
        />,
      );
      expect(container.querySelector('.speak-strip')).toBeTruthy();
      act(() => vi.advanceTimersByTime(650));
      expect(container.querySelector('.speak-strip')).toBeNull();
      expect(container.querySelector('.my-idle')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('omitting idle falls back to rendering nothing (Demo keeps its old behavior)', () => {
    const { container } = render(
      <SpeakingDock line={null} speaking={false} captions={true} onInterrupt={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
