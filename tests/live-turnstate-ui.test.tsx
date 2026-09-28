import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ListeningCard } from '../src/live/turnstate/ListeningCard';
import { WorkingSkeletons } from '../src/live/turnstate/WorkingSkeletons';
import { TurnActivityChips } from '../src/live/turnstate/TurnActivityChips';

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

  // The gap this closes: the mic closes, every "I'm hearing you" indicator unmounts at once, and
  // the surface is blank for the length of a transcription — which read as "it missed that".
  describe('while the utterance is being transcribed', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('holds the card immediately, and stills it only after the anti-flash beat', () => {
      const { container, rerender } = render(<ListeningCard transcript={null} mode="tap" />);
      rerender(<ListeningCard transcript={null} mode="tap" transcribing />);
      // Immediately: the card is still here (continuity), still reading as an open mic.
      expect(container.querySelector('.listen-card')).not.toHaveClass('is-transcribing');
      act(() => void vi.advanceTimersByTime(300));
      const card = container.querySelector('.listen-card');
      expect(card).toHaveClass('is-transcribing');
      expect(container.querySelector('.listen-note')?.textContent).toBe('Got that — one moment…');
      expect(container.querySelector('.listen-line')?.textContent).toContain('Heard you');
    });

    it('never stills for a transcription that finished inside the beat', () => {
      const { container, rerender } = render(
        <ListeningCard transcript={null} mode="tap" transcribing />,
      );
      act(() => void vi.advanceTimersByTime(200));
      rerender(<ListeningCard transcript={null} mode="tap" />);
      act(() => void vi.advanceTimersByTime(400));
      expect(container.querySelector('.listen-card')).not.toHaveClass('is-transcribing');
    });

    it('keeps a transcript it already has, rather than replacing it with the state', () => {
      const { container } = render(
        <ListeningCard transcript="should I flex Nabers" mode="tap" transcribing />,
      );
      act(() => void vi.advanceTimersByTime(300));
      expect(container.querySelector('.listen-line')?.textContent).toContain(
        'should I flex Nabers',
      );
    });
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
