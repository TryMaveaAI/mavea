import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StarterChips } from '../src/live/welcome/StarterChips';
import { SetupWizard } from '../src/live/setup/SetupWizard';

// The welcome hub's conversation starters:
// (a) all four kinds render, kicker + ask
// (b) tapping a chip starts the conversation with that exact ask
// (c) a returning user's Go hub leads with the conversational headline and the chips

const SETUP_KEY = 'mavea-live-setup-v1';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem('mavea-live-v2');
});

describe('StarterChips', () => {
  it('(a) renders the four starter kinds with their asks', () => {
    render(<StarterChips onStart={vi.fn()} />);
    for (const kicker of ['Build', 'Decide', 'Understand', 'Plan']) {
      expect(screen.getByText(kicker)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('(b) tapping a chip starts with that exact ask', () => {
    const onStart = vi.fn();
    render(<StarterChips onStart={onStart} />);
    fireEvent.click(screen.getByText(/train or fly to Boston/i));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('Should I take the train or fly to Boston?');
  });
});

describe('Welcome hub (returning user)', () => {
  it('(c) leads with the conversational headline and shows the starters', () => {
    localStorage.setItem(SETUP_KEY, '1');
    render(
      <SetupWizard speak={vi.fn()} goDemo={vi.fn()} onStart={vi.fn()} onStartTalking={vi.fn()} />,
    );
    expect(screen.getByText('What are we figuring out?')).toBeInTheDocument();
    expect(screen.getByText(/switch topics whenever you want/i)).toBeInTheDocument();
    expect(screen.getByText('Understand')).toBeInTheDocument();
  });
});
