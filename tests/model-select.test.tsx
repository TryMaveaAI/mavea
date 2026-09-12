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
  it('presents every suggested model with its trait note and a Recommended marker', () => {
    render(<Harness provider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show model options' }));

    const info = providerInfo('anthropic');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(
      info.suggestedModels.map(
        (m) => m + (m === info.defaultModel ? 'Recommended' : '') + (info.modelNotes?.[m] ?? ''),
      ),
    );
  });

  // Nothing is current until the reader picks. The recommended model is LABELLED as a suggestion,
  // never marked selected — no model is substituted at request time, so showing one as chosen
  // would name a model that will not be used.
  it('marks nothing current while the field is empty', () => {
    render(<Harness provider="gemini" />);
    fireEvent.click(input());
    const current = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-selected') === 'true');
    expect(current).toBeUndefined();
    expect(
      screen.getByRole('option', { name: new RegExp(providerInfo('gemini').defaultModel) })
        .textContent,
    ).toContain('Recommended');
  });

  // A reader who never opens the menu still has to learn that this model was suggested rather than
  // fixed, and where it sits in the provider's range — the id alone says neither.
  it('says on the face of it that the filled-in model is a recommendation, and why', () => {
    render(<Harness provider="gemini" initial={providerInfo('gemini').defaultModel} />);
    const hint = screen.getByText(/Recommended/);
    expect(hint).toBeVisible();
    // Deliberately NOT a ranking claim. "the lightest this provider offers" and "the cheapest to
    // run" both rank against a lineup and a rate card that change without us, and neither is
    // knowable here — Mavéa holds no rate card, and on BYOK the reader is billed on their own
    // terms. The hint says what was chosen and why, which is ours to state and cannot go stale.
    expect(hint).toHaveTextContent(/a lightweight model chosen to balance speed and quality/i);
    expect(hint).not.toHaveTextContent(/cheapest|lightest/i);
    // The field takes free text, and nothing else on screen says so — the suggestions read as the
    // set of options and the placeholder reads as a value. Say it, and say it where a reader who
    // has ALREADY chosen still sees it, which is why it is asserted on the un-recommended hint too.
    expect(hint).toHaveTextContent(/type any model id/i);
  });

  it('drops the recommendation line once a different model is chosen', () => {
    render(<Harness provider="gemini" initial="gemini-3.8-flash" />);
    expect(screen.queryByText(/Recommended —/)).toBeNull();
  });

  it('selecting an option writes the model id and closes the menu', () => {
    render(<Harness provider="anthropic" />);
    fireEvent.click(input());
    fireEvent.click(screen.getByRole('option', { name: /claude-haiku-4-5/ }));
    expect(input().value).toBe('claude-haiku-4-5');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports the full keyboard path: arrows to move, Enter to pick, Escape to close', () => {
    // One suggestion per provider — the fastest — so the arrow has nowhere to move; Enter still
    // picks and closes, and a typed id is the way to any other model.
    const models = providerInfo('anthropic').suggestedModels;
    expect(models).toHaveLength(1);
    render(<Harness provider="anthropic" initial="" />);
    fireEvent.keyDown(input(), { key: 'ArrowDown' }); // opens on the suggestion
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input().value).toBe(models[0]);
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

  // A gateway carries no recommendation, so the empty field must not name one either: the
  // placeholder teaches the id's SHAPE, and a versioned id in it reads as a suggestion.
  it('suggests no gateway model in the empty field — only the id format', () => {
    render(<Harness provider="openrouter" />);
    const placeholder = input().placeholder;
    expect(placeholder).toContain('/');
    expect(placeholder).not.toMatch(/\d/);
    expect(placeholder).not.toMatch(/gemini|gpt|claude|grok|llama|mistral/i);
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

  // The line under the picker sets ONE expectation: which model you pick moves how long a turn
  // takes. It is shown for every provider because that is where the time actually goes — Mavéa's
  // own reasoning dial, not any one vendor — and because copy about a NAMED third party is a claim
  // we would have to stand behind. Earlier drafts said a gateway's "quality varies" and that some
  // models "can't build a canvas"; both are gone on purpose.
  describe('turn-length note', () => {
    const note = () => screen.queryByText(/how long a turn takes/i);
    const hints = (c: HTMLElement) => c.querySelectorAll('.drop-select-hint');

    it('appears for every provider, not just the gateways', () => {
      for (const p of ['gemini', 'anthropic', 'openai', 'grok', 'openrouter'] as const) {
        cleanup();
        render(<Harness provider={p} />);
        expect(note(), `${p} should carry the turn-length note`).toBeInTheDocument();
      }
    });

    it('names the range a reader can plan around', () => {
      render(<Harness provider="gemini" />);
      expect(note()).toHaveTextContent(/seconds to two minutes or more/i);
    });

    it('makes no claim about any third party — only about how long a turn takes', () => {
      // Copy shown to users about a named provider is a claim we would have to defend, and it
      // would be wrong anyway: a long turn is usually this app's own reasoning budget, not them.
      for (const p of ['openrouter', 'gemini'] as const) {
        cleanup();
        const { container } = render(<Harness provider={p} initial="vendor/model" />);
        const text = hints(container)[0]?.textContent ?? '';
        expect(text).not.toMatch(/slow|unreliable|poor|bad|low[- ]quality|worse|varies/i);
        expect(text).not.toMatch(/can.?t|cannot|fail|broken|ignore/i);
      }
    });

    it('stays as short as the note it replaced — a hint is not a paragraph', () => {
      // The first draft ran to six lines of grey text in the 242px hint column. jsdom has no
      // layout, so pin the proxy that caused it: character count.
      const { container } = render(<Harness provider="openrouter" initial="vendor/m" />);
      expect((hints(container)[0]?.textContent ?? '').length).toBeLessThanOrEqual(100);
    });

    it('never stacks with the free-route note — one line, both facts', () => {
      const { container } = render(
        <Harness provider="openrouter" initial="nvidia/nemotron-3.5-lightning:free" />,
      );
      expect(hints(container)).toHaveLength(1);
      expect(hints(container)[0]).toHaveTextContent(/how long a turn takes/i);
      expect(hints(container)[0]).toHaveTextContent(/rate-limited/i);
    });
  });

  // A `:free`-suffixed route is a different service from the model of the same name without the
  // suffix — queued and rate limited — and Mavéa answers it with a smaller canvas and a longer
  // patience. Saying so is what keeps a slower, shorter answer legible as a deliberate trade
  // instead of a malfunction. The note names the suffix and the limit, never a price.
  describe(':free route note', () => {
    const hint = () => screen.queryByText(/rate-limited/i);

    it('appears once the typed id carries the :free suffix', () => {
      render(<Harness provider="openrouter" initial="nvidia/nemotron-3.5-lightning:free" />);
      expect(hint()).toBeInTheDocument();
    });

    it('stays away for the same model without the suffix', () => {
      render(<Harness provider="openrouter" initial="nvidia/nemotron-3.5-lightning" />);
      expect(hint()).toBeNull();
    });

    it('is not fooled by a model merely named "free"', () => {
      render(<Harness provider="openrouter" initial="acme/freeform-7b" />);
      expect(hint()).toBeNull();
    });

    it('leaves the field itself untouched — the note sits outside the combobox', () => {
      render(<Harness provider="openrouter" initial="vendor/model:free" />);
      expect(input().value).toBe('vendor/model:free');
      expect(input().closest('.drop-select')).not.toContainElement(hint());
    });
  });
});
