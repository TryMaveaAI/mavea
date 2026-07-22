import { useState, type ReactElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DropSelect, type DropOption } from '../src/live/setup/DropSelect';

afterEach(cleanup);

const VOICES: DropOption[] = [
  { value: 'heart', label: 'Heart', note: 'warm' },
  { value: 'emma', label: 'Emma', note: 'calm' },
  { value: 'bella', label: 'Bella', note: 'bright' },
];

function Harness({ initial = 'heart' }: { initial?: string }): ReactElement {
  const [value, setValue] = useState(initial);
  return <DropSelect ariaLabel="Voice" options={VOICES} value={value} onChange={setValue} />;
}

const trigger = (): HTMLButtonElement => screen.getByRole('combobox') as HTMLButtonElement;

describe('DropSelect', () => {
  it('shows the current choice on the trigger and every option with its note in the menu', () => {
    render(<Harness initial="emma" />);
    expect(trigger()).toHaveTextContent('Emma');
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Heartwarm',
      'Emmacalm',
      'Bellabright',
    ]);
    expect(screen.getByRole('option', { name: /Emma/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('selecting an option updates the value, closes the menu, and keeps focus on the trigger', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: /Bella/ }));
    expect(trigger()).toHaveTextContent('Bella');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports arrows, Enter, and Escape from the trigger', () => {
    render(<Harness initial="heart" />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // opens on the current option
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // heart → emma
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(trigger()).toHaveTextContent('Emma');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(trigger(), { key: 'ArrowUp' });
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes when focus leaves, and never opens while disabled', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(trigger());
    expect(screen.queryByRole('listbox')).toBeNull();

    cleanup();
    render(
      <DropSelect ariaLabel="Voice" options={VOICES} value="heart" onChange={() => {}} disabled />,
    );
    fireEvent.click(trigger());
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
