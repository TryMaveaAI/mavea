import { act, fireEvent, render, screen } from '@testing-library/react';
import { AnswerTheatre } from '../src/flagship/sections/AnswerTheatre';
import { loadTourCorpus } from '../src/tour/corpus';
import type { ConversationSpec } from '../src/data/conversation';
import { familiesFor, loadFamilies } from '../src/canvas/blocks/loader';
import { readFileSync } from 'node:fs';

vi.mock('../src/canvas/TopicCanvas', () => ({
  TopicCanvas: ({ data }: { data: ConversationSpec }) => (
    <div data-testid="recorded-canvas">
      {data.title}
      <span>{data.blocks.length} actual cards</span>
      <span>{data.blocks.map((block) => block.type).join(', ')}</span>
    </div>
  ),
}));

describe('recorded homepage answers', () => {
  it('fits the full route itinerary into the fixed desktop stage', () => {
    const css = readFileSync('src/flagship/sections/answerTheatre.css', 'utf8');
    expect(css).toMatch(
      /data-preview-type='maproute'[\s\S]*\.mr-list[\s\S]*grid-template-columns:\s*repeat\(2/,
    );
    expect(css).toMatch(/data-preview-type='maproute'[\s\S]*\.mr-map/);
  });

  it('curates relevant visual cards instead of taking the first three blocks', async () => {
    render(<AnswerTheatre />);
    await act(async () => {});
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('plot');
    fireEvent.click(screen.getByRole('button', { name: '03 The milestones' }));
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('breakdown');
    fireEvent.click(screen.getByRole('button', { name: 'See a network learn' }));
    fireEvent.click(screen.getByRole('button', { name: '02 Training progress' }));
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('trainingcurve');
    expect(screen.getByTestId('recorded-canvas')).not.toHaveTextContent('etymtree');
  });
  beforeAll(async () => {
    const corpus = await loadTourCorpus();
    await Promise.all(
      corpus.conversations.map((entry) =>
        loadFamilies(familiesFor(entry.frames[0].spec.blocks.slice(0, 3))),
      ),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps reduced-motion playback manual with every part accessible', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<AnswerTheatre />);
    await act(async () => {});
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('1 actual cards');
    fireEvent.click(screen.getByRole('button', { name: /03 The milestones/ }));
    expect(screen.getByText('Part 3 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause answer' })).not.toBeInTheDocument();
  });

  it('reveals baked cards, pauses, replays, and cancels its timer on unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<AnswerTheatre />);
    await act(async () => {});
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('1 actual cards');
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByText('Part 2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause answer' }));
    act(() => {
      vi.advanceTimersByTime(8800);
    });
    expect(screen.getByText('Part 2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play answer' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replay answer' }));
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('1 actual cards');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('switches between genuinely different recorded answers and stops while hidden', async () => {
    vi.useFakeTimers();
    render(<AnswerTheatre />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'See a network learn' }));
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('How a Neural Network Learns');
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('cyclewheel');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('1 actual cards');
    fireEvent.click(screen.getByRole('button', { name: 'Trace the Pacific coast' }));
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('Pacific Coast Highway');
    expect(screen.getByTestId('recorded-canvas')).toHaveTextContent('maproute');
    expect(screen.getByText(/Curated recorded excerpt/)).toHaveTextContent('no prompt sent');
  });
});
