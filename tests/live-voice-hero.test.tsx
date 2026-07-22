import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AnswerHero } from '../src/live/voice/AnswerHero';
import { AnswerFooter } from '../src/live/voice/AnswerFooter';
import type { ConversationSpec, SuggestSpec } from '../src/data/conversation';

const spec = (over: Partial<ConversationSpec>): ConversationSpec =>
  ({ title: 'T', blocks: [], ...over }) as ConversationSpec;

describe('AnswerHero', () => {
  it('renders the ask label, the accented line, sources, and the inferred badge', () => {
    const { container, getByText } = render(
      <AnswerHero
        question="tell me about AI datacenters"
        narration="The real story is density — 50–100kW racks everywhere."
        sources={[{ title: 'OCP', url: 'https://opencompute.org/x' }]}
        inferred={1}
      />,
    );
    expect(getByText(/tell me about AI datacenters/)).toBeTruthy();
    expect(container.querySelector('.hero-accent')?.textContent).toBe('50–100kW');
    expect(getByText(/opencompute\.org/)).toBeTruthy();
    expect(getByText(/1 claim inferred/)).toBeTruthy();
  });

  it('hides the ask label and meta row when there is nothing honest to put in them', () => {
    const { container } = render(
      <AnswerHero question={null} narration="A line." sources={undefined} inferred={0} />,
    );
    expect(container.querySelector('.hero-ask')).toBeNull();
    expect(container.querySelector('.hero-meta')).toBeNull();
  });

  it('renders nothing without a narration', () => {
    const { container } = render(
      <AnswerHero question="q" narration="" sources={undefined} inferred={0} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('AnswerFooter', () => {
  const followups: SuggestSpec[] = [
    { label: 'Why did air cooling give up?', icon: 'spark', route: 'why air cooling' },
    { label: 'What does one cost?', icon: 'spark', route: 'datacenter cost' },
  ] as SuggestSpec[];

  it('renders grounded sources as links and follow-ups as rows that submit their route', () => {
    const onAsk = vi.fn();
    const { getByText, container } = render(
      <AnswerFooter
        spec={spec({ sources: [{ title: 'Open Compute', url: 'https://www.opencompute.org/a' }] })}
        followups={followups}
        onAsk={onAsk}
        busy={false}
      />,
    );
    const link = container.querySelector('.footer-grounded a') as HTMLAnchorElement;
    expect(link.href).toContain('opencompute.org');
    expect(link.rel).toContain('noopener');
    expect(getByText('opencompute.org')).toBeTruthy();
    fireEvent.click(getByText('Why did air cooling give up?'));
    expect(onAsk).toHaveBeenCalledWith('why air cooling');
  });

  it('disables follow-ups while a turn is in flight', () => {
    const onAsk = vi.fn();
    const { getByText } = render(
      <AnswerFooter spec={spec({})} followups={followups} onAsk={onAsk} busy={true} />,
    );
    fireEvent.click(getByText('What does one cost?'));
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('still renders the universal AI disclaimer when there are no sources or follow-ups', () => {
    const { getByText } = render(
      <AnswerFooter spec={spec({})} followups={[]} onAsk={() => {}} busy={false} />,
    );
    expect(getByText(/AI-generated; may be inaccurate/i)).toBeTruthy();
    expect(getByText(/not medical, legal, financial/i)).toBeTruthy();
  });

  it('renders every follow-up the model offered (no fixed cap)', () => {
    const many = [1, 2, 3, 4, 5].map(
      (n) => ({ label: `q${n}`, icon: 'spark', route: `r${n}` }) as SuggestSpec,
    );
    const { container } = render(
      <AnswerFooter spec={spec({})} followups={many} onAsk={() => {}} busy={false} />,
    );
    expect(container.querySelectorAll('.kg-row').length).toBe(5);
  });

  it('guards against a flood, capping at a generous ceiling', () => {
    const flood = Array.from(
      { length: 20 },
      (_, i) => ({ label: `q${i}`, icon: 'spark', route: `r${i}` }) as SuggestSpec,
    );
    const { container } = render(
      <AnswerFooter spec={spec({})} followups={flood} onAsk={() => {}} busy={false} />,
    );
    expect(container.querySelectorAll('.kg-row').length).toBe(12);
  });
});
