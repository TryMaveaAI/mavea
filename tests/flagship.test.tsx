import { render, fireEvent, waitFor } from '@testing-library/react';
import { FlagshipLanding } from '../src/flagship/FlagshipLanding';
import { heroCast } from '../src/demo/cast';

function setup() {
  const onPlay = vi.fn();
  const onEnterLive = vi.fn();
  const utils = render(<FlagshipLanding onPlay={onPlay} onEnterLive={onEnterLive} />);
  return { onPlay, onEnterLive, ...utils };
}

describe('FlagshipLanding', () => {
  it('renders the hero headline and the demo anchor', () => {
    const { container } = setup();
    expect(container.querySelector('.fl-hero-title')?.textContent).toContain('See what it means.');
    expect(container.querySelector('#flagship-demo')).toBeTruthy();
  });

  it('plays the first demo session when a card is clicked', async () => {
    const { onPlay, container } = setup();
    await waitFor(() => expect(container.querySelector('.fl-demo-card')).toBeTruthy());
    fireEvent.click(container.querySelector('.fl-demo-card')!);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][0].id).toBe(heroCast()[0].id);
  });

  it('shows all four demo cards at once', async () => {
    const { container } = setup();
    await waitFor(() => expect(container.querySelectorAll('.fl-demo-card').length).toBe(4));
  });

  it('enters Live with the typed seed from the hero composer', () => {
    const { onEnterLive, container } = setup();
    const input = container.querySelector('.fl-composer-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'why did Q3 dip?' } });
    fireEvent.submit(input.closest('form')!);
    expect(onEnterLive).toHaveBeenCalledWith('why did Q3 dip?');
  });

  it('enters Live from a hero example chip', () => {
    const { onEnterLive, getByText } = setup();
    fireEvent.click(getByText('Map 3 days in Lisbon'));
    expect(onEnterLive).toHaveBeenCalledWith('Map 3 days in Lisbon');
  });

  it('lists the real Live providers in the two-surfaces panel', async () => {
    const { container } = setup();
    await waitFor(() =>
      expect(container.querySelectorAll('.fl-model-chip').length).toBeGreaterThan(0),
    );
    const chips = [...container.querySelectorAll('.fl-model-chip')].map((c) => c.textContent);
    // The five hosted BYOK providers.
    expect(chips.length).toBeGreaterThanOrEqual(5);
    expect(chips.some((c) => /Gemini/.test(c ?? ''))).toBe(true);
  });

  it('closes both two-surfaces cards with a real chip row before the CTA', async () => {
    const { container } = setup();
    await waitFor(() => expect(container.querySelectorAll('.fl-surface').length).toBe(2));
    const surfaces = container.querySelectorAll('.fl-surface');
    const instantChips = [...surfaces[0].querySelectorAll('.fl-surface-chip')].map(
      (c) => c.textContent,
    );
    // The instant card's chips state the shipped access policy — no invented capability, and
    // "session-only" is the same bound HonestByDesign publishes for key storage.
    expect(instantChips).toEqual([
      'No sign-up',
      'No install',
      'Key-free tour',
      'Keys session-only',
    ]);
    // Both cards share the chip row immediately before their CTA button, so they read as one
    // balanced pair rather than one side looking unfinished.
    for (const surface of surfaces) {
      const chipRow = surface.querySelector('.fl-surface-chips');
      const cta = surface.querySelector('.fl-ghost-btn');
      expect(chipRow).toBeTruthy();
      expect(chipRow?.nextElementSibling).toBe(cta);
    }
  });

  it('shows the plain "Watch it work" link when no tour invite is passed', () => {
    const { getByText, queryByText } = setup();
    expect(getByText(/Watch it work/i)).toBeTruthy();
    expect(queryByText(/Play the tour/i)).toBeNull();
  });

  it('shows the dismissible tour invite instead, when asked to', () => {
    const onPlayTour = vi.fn();
    const onDismissTourInvite = vi.fn();
    const { getByText, queryByText } = render(
      <FlagshipLanding
        onPlay={vi.fn()}
        onEnterLive={vi.fn()}
        showTourInvite
        onPlayTour={onPlayTour}
        onDismissTourInvite={onDismissTourInvite}
      />,
    );
    // The invite replaces the plain link in the same spot — never both at once.
    expect(queryByText(/^Watch it work$/i)).toBeNull();
    expect(getByText(/2-minute guided tour/i)).toBeTruthy();

    fireEvent.click(getByText('Play the tour'));
    expect(onPlayTour).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText(/I'll explore on my own/i));
    expect(onDismissTourInvite).toHaveBeenCalledTimes(1);
  });

  it('omits the "View as living answer" shortcut unless a handler is passed, and fires it when clicked', () => {
    const { queryByText, rerender } = render(
      <FlagshipLanding
        onPlay={vi.fn()}
        onEnterLive={vi.fn()}
        showTourInvite
        onPlayTour={vi.fn()}
        onDismissTourInvite={vi.fn()}
      />,
    );
    expect(queryByText('View as living answer')).toBeNull();

    const onViewWorld = vi.fn();
    rerender(
      <FlagshipLanding
        onPlay={vi.fn()}
        onEnterLive={vi.fn()}
        showTourInvite
        onPlayTour={vi.fn()}
        onDismissTourInvite={vi.fn()}
        onViewWorld={onViewWorld}
      />,
    );
    fireEvent.click(queryByText('View as living answer')!);
    expect(onViewWorld).toHaveBeenCalledTimes(1);
  });
});
