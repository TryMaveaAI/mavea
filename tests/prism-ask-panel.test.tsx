import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskPanel } from '../src/live/prism/ask/AskPanel';
import type { AskTurn } from '../src/live/prism/ask';

// AskPanel is the "ask the document" dock: a silent, text-first thread. These pin its core wiring —
// the answer renders with an honest coverage pill + page chips, a chip click spotlights its span, a
// typed question is asked, send is disabled while busy, and an outside fact is walled off from the doc.

afterEach(cleanup);

const span = { doc: 0, page: 3, quote: 'Rent shall remain fixed for the term.' };
const answered: AskTurn = {
  id: 'q1',
  question: 'Can they raise rent mid-term?',
  status: 'done',
  answer: { text: 'No — rent is fixed for the term.', coverage: 'full', spans: [span] },
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof AskPanel>> = {}) {
  const props = {
    turns: [answered],
    busy: false,
    onAsk: vi.fn(),
    onFocusSpan: vi.fn(),
    activeSpan: null,
    multiDoc: false,
    docLabel: (d: number) => `Doc ${d}`,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AskPanel {...props} />);
  return props;
}

describe('AskPanel', () => {
  it('renders the answer, its coverage, and the verbatim page chip', () => {
    renderPanel();
    expect(screen.getByText('No — rent is fixed for the term.')).toBeTruthy();
    expect(screen.getByText('in the document')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'p.3' })).toBeTruthy();
  });

  it('spotlights the span when its chip is clicked', () => {
    const { onFocusSpan } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'p.3' }));
    expect(onFocusSpan).toHaveBeenCalledWith(span);
  });

  it('asks a typed question', () => {
    const { onAsk } = renderPanel();
    const input = screen.getByLabelText('Ask this document a question');
    fireEvent.change(input, { target: { value: 'Who pays utilities?' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onAsk).toHaveBeenCalledWith('Who pays utilities?');
  });

  it('disables send while an answer is in flight', () => {
    renderPanel({ busy: true });
    expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows honest provenance and walls off an outside fact when the document does not cover it', () => {
    const none: AskTurn = {
      id: 'q2',
      question: "What's the stock price?",
      status: 'done',
      answer: {
        text: '',
        coverage: 'none',
        spans: [],
        outside: {
          fact: 'It traded at $5 yesterday.',
          citation: { quote: 'shares closed at $5', url: 'https://ex.com/a', host: 'ex.com' },
        },
      },
    };
    renderPanel({ turns: [none] });
    expect(screen.getByText('not in this document')).toBeTruthy();
    expect(screen.getByText('from outside this document')).toBeTruthy();
    expect(screen.getByText('It traded at $5 yesterday.')).toBeTruthy();
  });

  it('labels a page chip with its document in multi-document mode', () => {
    renderPanel({ multiDoc: true, docLabel: (d) => `Lease ${d}` });
    expect(screen.getByRole('button', { name: 'Lease 0 · p.3' })).toBeTruthy();
  });

  it('never links an outside citation whose URL is not plain http(s)', () => {
    const unsafe: AskTurn = {
      id: 'q3',
      question: 'Any price target?',
      status: 'done',
      answer: {
        text: '',
        coverage: 'none',
        spans: [],
        outside: {
          fact: 'Analysts see $80.',
          citation: {
            quote: 'price target of $80',
            url: 'javascript:alert(1)',
            host: 'ex.com',
          },
        },
      },
    };
    renderPanel({ turns: [unsafe] });
    expect(screen.getByText('Analysts see $80.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/price target of \$80/)).toBeTruthy();
  });
});
