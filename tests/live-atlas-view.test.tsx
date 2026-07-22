import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasView } from '../src/live/atlas/AtlasView';
import type { AtlasRecord } from '../src/live/atlas/store';

// The atlas overlay: real counts in the header, conversations land on tap, Fly-to finds
// by what the user remembers, and an empty atlas says so instead of inventing geography.

const rec = (id: string, title: string, question: string, savedAt: number): AtlasRecord => ({
  id,
  question,
  title,
  firstSeen: savedAt,
  savedAt,
  blocks: 3,
});

const RECORDS = [
  rec('budget plan', 'Monthly Budget Plan', 'budget plan for $5,000', Date.now() - 3600_000),
  rec('budget framework', 'Budget Framework', 'how does the budget framework work', Date.now()),
  rec('moon sky', 'The Moon Sky', 'why is the moon sky black', Date.now()),
];

afterEach(cleanup);

describe('AtlasView', () => {
  it('shows the real span and conversation count', () => {
    render(<AtlasView records={RECORDS} chapters={[]} onLand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/3 conversations/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Your atlas' })).toBeTruthy();
  });

  it('tapping a conversation lands in it', () => {
    const onLand = vi.fn();
    render(<AtlasView records={RECORDS} chapters={[]} onLand={onLand} onClose={vi.fn()} />);
    // Fly into the neighborhood, tap the night to rehydrate it, then drop back into it.
    fireEvent.click(screen.getByRole('button', { name: /BLACK, 1 conversations/ }));
    fireEvent.click(screen.getByText('The Moon Sky'));
    fireEvent.click(screen.getByRole('button', { name: /Drop back into it/ }));
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onLand.mock.calls[0][0].id).toBe('moon sky');
  });

  it('Fly to… filters by what the user remembers', () => {
    render(<AtlasView records={RECORDS} chapters={[]} onLand={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Find a conversation'), {
      target: { value: 'moon' },
    });
    const matches = screen.getAllByRole('listbox');
    expect(matches).toHaveLength(1);
    expect(matches[0].textContent).toContain('The Moon Sky');
    expect(matches[0].textContent).not.toContain('Budget Framework');
  });

  it('Synthesize asks an honest question — real titles and count, no false "about X" premise', () => {
    const onGoDeeper = vi.fn();
    render(
      <AtlasView
        records={RECORDS}
        chapters={[]}
        onLand={vi.fn()}
        onGoDeeper={onGoDeeper}
        onClose={vi.fn()}
      />,
    );
    // Synthesize lives inside the neighborhood tier — fly into the 2-conversation hood first.
    fireEvent.click(screen.getByRole('button', { name: /BUDGET, 2 conversations/ }));
    fireEvent.click(screen.getByRole('button', { name: /Synthesize/ }));
    expect(onGoDeeper).toHaveBeenCalledTimes(1);
    const ask = onGoDeeper.mock.calls[0][0] as string;
    expect(ask).toMatch(/Looking across 2 of my past conversations/);
    expect(ask).toContain('Monthly Budget Plan');
    expect(ask).toContain('Budget Framework');
    // Never claims the conversations are all "about" a single topic — that premise can be false.
    expect(ask).not.toMatch(/conversations about/);
  });

  it('an empty atlas says so — no invented geography', () => {
    render(<AtlasView records={[]} chapters={[]} onLand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Your atlas grows as you talk/)).toBeTruthy();
    expect(document.querySelector('.atlas-hood')).toBeNull();
  });

  it('Escape closes', () => {
    const onClose = vi.fn();
    render(<AtlasView records={RECORDS} chapters={[]} onLand={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
