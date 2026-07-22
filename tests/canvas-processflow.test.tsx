import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessFlow } from '../src/canvas/blocks/flows/ProcessFlow';

// Regression coverage for the "HOW TO DECIDE" screenshot: every step's detail used to be gated
// behind hover, so a static render (and every touch device, Focus mode, and Replay capture)
// showed bare cards with one lone description. Details must now render for ALL steps with no
// interaction, and the steps must be a real ordered list.
describe('ProcessFlow', () => {
  const steps = [
    {
      label: 'Audit Software',
      detail: 'List the apps you depend on daily.',
      icon: 'edit' as const,
    },
    {
      label: 'Check Ecosystem',
      detail: 'How tied are you to iCloud and Handoff?',
      icon: 'share' as const,
    },
    {
      label: 'Test Hardware',
      detail: 'Visit a store to feel the keyboard and trackpad.',
      icon: 'layers' as const,
    },
  ];

  it('shows EVERY step detail without any hover — not just the active card', () => {
    render(<ProcessFlow title="How to decide" steps={steps} />);
    for (const s of steps) {
      expect(screen.getByText(s.label)).toBeInTheDocument();
      expect(screen.getByText(s.detail)).toBeInTheDocument(); // the fix: no hover required
    }
  });

  it('numbers the steps in order', () => {
    render(<ProcessFlow title="How to decide" steps={steps} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders an ordered list of step items (semantic sequence)', () => {
    render(<ProcessFlow title="How to decide" steps={steps} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(steps.length);
  });

  it('renders an optional branch note when present', () => {
    render(
      <ProcessFlow
        title="A request, end to end"
        steps={[
          { label: 'Gateway', detail: 'Route + trace', branch: 'cache hit → return in <20ms' },
          { label: 'Index', detail: 'Inverted lookup' },
        ]}
      />,
    );
    expect(screen.getByText('cache hit → return in <20ms')).toBeInTheDocument();
  });
});
