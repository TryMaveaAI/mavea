import { useState, type ReactElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DropSelect, type DropOption } from '../src/live/setup/DropSelect';

const src = (rel: string): string => readFileSync(join(__dirname, '..', 'src', rel), 'utf8');

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

  it('keeps Escape inside the menu, so it cannot close the dialog the picker sits in', () => {
    // Modals trap focus with a NATIVE keydown listener on the dialog node, which fires long before
    // React's root delegate — so a picker that dismissed itself through a synthetic handler shut
    // the whole Settings dialog and never closed its own menu.
    const onAncestorEscape = vi.fn();
    render(
      <div role="presentation" onKeyDown={(e) => e.key === 'Escape' && onAncestorEscape()}>
        <Harness />
      </div>,
    );
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(onAncestorEscape).not.toHaveBeenCalled();
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

// The pickers render on standalone routes (#/courses, #/ripple) that never mount LiveApp, so
// they can't rely on Live's runtime stylesheet for their menu — the classes came out unstyled
// there. Each component pulls its own CSS instead, which no route can skip. jsdom parses no
// stylesheets (vitest runs with `css: false`), so this is a source scan.
describe('drop-select styling travels with the components', () => {
  const menuCss = src('live/setup/drop-select.css');

  it('defines the menu rules in the components’ own stylesheet, not the wizard sheet', () => {
    for (const cls of [
      '.drop-select',
      '.drop-select-input',
      '.drop-select-trigger',
      '.drop-select-chevron',
      '.drop-select-menu',
      '.drop-select-option',
      '.drop-select-id',
      '.drop-select-badge',
      '.drop-select-note',
      '.drop-select-foot',
    ]) {
      expect(menuCss, `${cls} is missing from drop-select.css`).toContain(`${cls} `);
    }
    // Only the wizard's own layout for the voice row may still mention the picker there.
    const wizard = src('styles/setup-wizard.css');
    expect(wizard.match(/\.drop-select/g)).toEqual(['.drop-select']);
    expect(wizard).toContain('.voice-row .drop-select {');
  });

  it('is imported by both pickers', () => {
    expect(src('live/setup/DropSelect.tsx')).toContain("import './drop-select.css'");
    expect(src('live/setup/ModelSelect.tsx')).toContain("import './drop-select.css'");
  });
});
