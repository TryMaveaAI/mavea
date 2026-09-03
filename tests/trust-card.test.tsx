// The provenance card is the promise behind every figure a living answer prints: click it and the
// receipt is there, or the card says plainly that there isn't one. These lock the parts a reader
// (or a screen reader) depends on — the badge, the verbatim quote, the scheme gate on a
// model-supplied URL, the walk down a derivation, and the way the card gets out of the way again.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildRegistry, computeCalc } from '../src/live/trust';
import type { UsedInRef, UsedInSource, WorldValue } from '../src/live/trust';
import { qualitative, type Receipt } from '../src/live/ground/types';
import { TrustProvider } from '../src/live/trust/TrustProvider';
import { ProvValue } from '../src/live/trust/ProvValue';

function webValue(id: string, label: string, value: number, receipt: Receipt): WorldValue {
  return {
    id,
    label,
    kind: 'grounded',
    resolution: { ok: true, tier: 'T2', value, raw: `${value}%`, receipt, surface: 'web' },
  };
}

function fileValue(id: string, label: string, value: number, receipt: Receipt): WorldValue {
  return {
    id,
    label,
    kind: 'grounded',
    resolution: { ok: true, tier: 'T1', value, raw: String(value), receipt, surface: 'user' },
  };
}

function calculated(
  id: string,
  label: string,
  formula: string,
  inputs: string[],
  values: WorldValue[],
): WorldValue {
  const byId = new Map(values.map((v) => [v.id, v]));
  const computed = computeCalc({ formula, inputs }, (vid) => byId.get(vid));
  if (!computed) throw new Error(`fixture formula did not compute: ${formula}`);
  return {
    id,
    label,
    kind: 'calculated',
    value: computed.value,
    raw: computed.raw,
    calc: { formula, inputs },
  };
}

const PRICE = fileValue('price', 'Widget price', 10, { quote: 'The widget costs 10 dollars' });
const UNITS = fileValue('daily_units', 'Units per day', 3, { quote: 'we sell 3 units a day' });
const REVENUE = calculated(
  'daily_revenue',
  'Revenue per day',
  'price * daily_units',
  ['price', 'daily_units'],
  [PRICE, UNITS],
);

function mount(
  values: WorldValue[],
  opts: { ids?: string[]; refs?: UsedInSource[]; onNavigate?: (ref: UsedInRef) => void } = {},
) {
  const registry = buildRegistry(new Map(values.map((v) => [v.id, v])), opts.refs ?? []);
  return render(
    <TrustProvider registry={registry} onNavigate={opts.onNavigate}>
      {(opts.ids ?? values.map((v) => v.id)).map((id) => (
        <ProvValue key={id} id={id} />
      ))}
    </TrustProvider>,
  );
}

/** A figure's accessible name says what pressing it opens, and that WORDING is kind-specific
 *  (see `opens what it actually holds` below) — so tests that just need the figure match any of
 *  the three rather than asserting one. */
const OPENS = /source available|how this was worked out|illustrative — no source/i;

function openFirst(): void {
  fireEvent.click(screen.getAllByRole('button', { name: OPENS })[0]);
}

describe('ProvValue', () => {
  it('is a real button that names its affordance, and never a button without one', () => {
    const { container } = mount([PRICE]);
    const btn = screen.getByRole('button', { name: OPENS });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('data-status')).toBe('grounded');
    expect(container.textContent).toContain('10');

    const structure = mount([
      { id: 's', label: 'Ad spend', kind: 'structure', resolution: qualitative('Ad spend') },
    ]);
    expect(structure.container.querySelector('button')).toBeNull();
    expect(structure.container.querySelector('.tr-num-qual')?.textContent).toBe('Ad spend');
  });

  it('renders nothing for an unknown id — never "undefined" or "NaN"', () => {
    const registry = buildRegistry(new Map(), []);
    const { container } = render(
      <TrustProvider registry={registry}>
        <ProvValue id="nope" />
      </TrustProvider>,
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it('opens what it actually holds — never a source an illustrative figure has not got', () => {
    // Every figure once announced ", source available". An illustrative magnitude carries no
    // receipt, so its card renders no SOURCE section at all — and on an illustrative world that
    // was every clickable figure on the screen promising one.
    const illustrative: WorldValue = {
      id: 'half_life',
      label: 'Half life',
      kind: 'illustrative',
      resolution: {
        ok: true,
        tier: 'T3',
        value: 5,
        raw: '5 years',
        illustrative: 'textbook order of magnitude',
        surface: 'model',
      },
    };
    mount([PRICE, REVENUE, illustrative]);
    const named = screen.getAllByRole('button').map((b) => b.textContent);
    expect(named).toEqual([
      '10, source available',
      '30, how this was worked out',
      '5 years, illustrative — no source',
    ]);
    expect(screen.queryByRole('button', { name: /5 years, source available/i })).toBeNull();
  });
});

describe('ProvenanceCard status', () => {
  it('badges each status in plain words', () => {
    const badge = (v: WorldValue): string | undefined => {
      const { container, unmount } = mount([v]);
      fireEvent.click(screen.getByRole('button', { name: OPENS }));
      const text = container.querySelector('.tr-badge')?.textContent ?? undefined;
      unmount();
      return text;
    };
    expect(badge(PRICE)).toBe('GROUNDED');
    expect(badge(REVENUE)).toBe('CALCULATED LOCALLY');
    expect(
      badge({
        id: 'half_life',
        label: 'Caffeine half-life',
        kind: 'illustrative',
        resolution: {
          ok: true,
          tier: 'T3',
          value: 5,
          raw: '5 h',
          illustrative: 'Shows the shape, not your numbers',
          surface: 'model',
        },
      }),
    ).toBe('ILLUSTRATIVE');
  });

  it('carries the illustrative caveat in the footer', () => {
    mount([
      {
        id: 'half_life',
        label: 'Caffeine half-life',
        kind: 'illustrative',
        resolution: {
          ok: true,
          tier: 'T3',
          value: 5,
          raw: '5 h',
          illustrative: 'Shows the shape, not your numbers',
          surface: 'model',
        },
      },
    ]);
    openFirst();
    expect(document.querySelector('.tr-caveat')?.textContent).toContain(
      'shows the shape, not a measured fact',
    );
  });
});

describe('ProvenanceCard source', () => {
  it('shows the verbatim quote and links the host', () => {
    mount([
      webValue('tickets', 'Ticket drop', 18, {
        quote: 'Support tickets fell 18% after the onboarding fix',
        url: 'https://www.example.com/q2-report',
        host: 'example.com',
      }),
    ]);
    openFirst();
    expect(document.querySelector('.tr-quote')?.textContent).toContain(
      'Support tickets fell 18% after the onboarding fix',
    );
    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link.getAttribute('href')).toBe('https://www.example.com/q2-report');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('never activates a non-http scheme — the host reads as plain text', () => {
    mount([
      webValue('shady', 'Shady figure', 42, {
        quote: 'Margins doubled to 42%',
        url: 'javascript:alert(1)',
        host: 'evil.example',
      }),
    ]);
    openFirst();
    const card = document.querySelector('.tr-card');
    expect(card?.querySelector('a')).toBeNull();
    expect(card?.querySelector('.tr-host')?.textContent).toBe('evil.example');
  });

  it('locates a T1 figure in the attached file', () => {
    mount([
      fileValue('cell', 'Q2 revenue', 284, {
        quote: 'Q2 revenue 284',
        doc: 1,
        page: 7,
        cell: 'B14',
      }),
    ]);
    openFirst();
    // `doc` is 0-indexed in the contract; a reader counts from one.
    expect(document.querySelector('.tr-host')?.textContent).toBe(
      'Your file · doc 2, p. 7, cell B14',
    );
  });
});

describe('ProvenanceCard derivation', () => {
  it('walks into an input and back again', () => {
    mount([PRICE, UNITS, REVENUE], { ids: ['daily_revenue'] });
    openFirst();
    expect(document.querySelector('.tr-label')?.textContent).toBe('Revenue per day');
    expect(document.querySelector('.tr-formula')?.textContent).toBe('Widget price * Units per day');
    expect(document.querySelector('.tr-back')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Widget price/ }));
    expect(document.querySelector('.tr-label')?.textContent).toBe('Widget price');
    const back = screen.getByRole('button', { name: /back to Revenue per day/i });

    fireEvent.click(back);
    expect(document.querySelector('.tr-label')?.textContent).toBe('Revenue per day');
    expect(document.querySelector('.tr-back')).toBeNull();
  });

  it('collapses a trace nobody would scan', () => {
    const inputs = Array.from({ length: 50 }, (_, i) => `n${i}`);
    const leaves = inputs.map((id, i) => fileValue(id, `Input ${i}`, 1, { quote: 'costs 1' }));
    const total = calculated('total', 'Total', inputs.join(' + '), inputs, leaves);
    mount([...leaves, total], { ids: ['total'] });
    openFirst();
    expect(document.querySelectorAll('.tr-inputs li').length).toBe(8);
    expect(document.querySelector('.tr-more')?.textContent).toBe('…and 42 more');
  });
});

describe('ProvenanceCard navigation and dismissal', () => {
  it('sends the reader to a use without closing the card', () => {
    const onNavigate = vi.fn();
    const refs: UsedInSource[] = [
      { valueId: 'price', surface: 'node', id: 'n1', label: 'Price node' },
    ];
    mount([PRICE], { refs, onNavigate });
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Price node' }));
    expect(onNavigate).toHaveBeenCalledWith<[UsedInRef]>({
      surface: 'node',
      id: 'n1',
      label: 'Price node',
    });
    expect(document.querySelector('.tr-card')).toBeTruthy();
  });

  it('closes on Escape and on a click away, handing focus back to the figure', () => {
    mount([PRICE]);
    const btn = screen.getByRole('button', { name: OPENS });

    fireEvent.click(btn);
    const card = screen.getByRole('dialog');
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(document.querySelector('.tr-card')).toBeNull();
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);
    expect(document.querySelector('.tr-card')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector('.tr-card')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
});
