import { useState, type ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelSelect } from '../src/live/setup/ModelSelect';
import { MODEL_CATALOG_AUDIT, providerInfo } from '../src/live/providers/info';
import type { ProviderId } from '../src/types/mavea';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/** The component is controlled at both call sites (config store); mirror that here. */
function Harness({
  provider,
  initial = '',
}: {
  provider: ProviderId;
  initial?: string;
}): ReactElement {
  const [value, setValue] = useState(initial);
  return <ModelSelect provider={provider} value={value} onChange={setValue} />;
}

const input = (): HTMLInputElement => screen.getByRole('combobox') as HTMLInputElement;

describe('ModelSelect', () => {
  it('presents every suggested model with its trait note and a Default marker', () => {
    render(<Harness provider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show model options' }));

    const info = providerInfo('anthropic');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(
      info.suggestedModels.map(
        (m) => m + (m === info.defaultModel ? 'Default' : '') + (info.modelNotes?.[m] ?? ''),
      ),
    );
  });

  it('marks the effective model current even while the field is empty (default fallback)', () => {
    render(<Harness provider="gemini" />);
    fireEvent.click(input());
    const current = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-selected') === 'true');
    expect(current?.textContent).toContain(providerInfo('gemini').defaultModel);
  });

  it('selecting an option writes the model id and closes the menu', () => {
    render(<Harness provider="anthropic" />);
    fireEvent.click(input());
    fireEvent.click(screen.getByRole('option', { name: /claude-haiku-4-5/ }));
    expect(input().value).toBe('claude-haiku-4-5');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports the full keyboard path: arrows to move, Enter to pick, Escape to close', () => {
    const models = providerInfo('anthropic').suggestedModels;
    render(<Harness provider="anthropic" initial={models[0]} />);
    fireEvent.keyDown(input(), { key: 'ArrowDown' }); // opens on the current model
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: 'ArrowDown' }); // current → the next suggestion
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input().value).toBe(models[1]);
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('gateways get a footer-only menu — no options, free text kept, any id welcome', () => {
    render(<Harness provider="openrouter" />);
    fireEvent.click(input());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.change(input(), { target: { value: 'mistralai/mistral-large' } });
    expect(input().value).toBe('mistralai/mistral-large');
    expect(screen.getByText(/Any OpenRouter model ID works/)).toBeInTheDocument();
  });

  it('links each provider’s full model catalog so the wider menu is discoverable', () => {
    render(<Harness provider="openai" />);
    fireEvent.click(input());
    expect(screen.getByRole('link', { name: /All models/ })).toHaveAttribute(
      'href',
      MODEL_CATALOG_AUDIT.sources.openai,
    );
  });

  it('closes when focus leaves the field', () => {
    render(<Harness provider="gemini" />);
    fireEvent.click(input());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(input());
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
