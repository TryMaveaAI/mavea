import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LiveMark, InferredMark, EvidencePill, GroundedIn } from '../src/canvas/provenance';

describe('EvidencePill', () => {
  it('labels each confidence level honestly, with matching bars', () => {
    const strong = render(<EvidencePill level="strong" />);
    expect(strong.getByText('Strong evidence')).toBeTruthy();
    expect(strong.container.querySelectorAll('.prov-bars i.on').length).toBe(3);

    const partial = render(<EvidencePill level="partial" />);
    expect(partial.getByText('Partial evidence')).toBeTruthy();
    expect(partial.container.querySelectorAll('.prov-bars i.on').length).toBe(2);

    const inferred = render(<EvidencePill level="inferred" title="best estimate" />);
    expect(inferred.getByText('Inferred')).toBeTruthy();
    expect(inferred.container.querySelector('.prov-pill')?.getAttribute('title')).toBe(
      'best estimate',
    );
  });
});

describe('LiveMark / InferredMark', () => {
  it('renders the live dot and label', () => {
    const { getByText, container } = render(<LiveMark />);
    expect(getByText('Live')).toBeTruthy();
    expect(container.querySelector('.prov-dot')).toBeTruthy();
  });

  it('counts inferred claims, singular and plural', () => {
    expect(render(<InferredMark count={1} />).getByText('1 claim inferred')).toBeTruthy();
    expect(render(<InferredMark count={3} />).getByText('3 claims inferred')).toBeTruthy();
    expect(render(<InferredMark />).getByText('Inferred')).toBeTruthy();
  });
});

describe('GroundedIn', () => {
  it('lists real sources as links, and renders nothing without any', () => {
    const { getByText, container } = render(
      <GroundedIn sources={[{ title: 'Open Compute', url: 'https://opencompute.org' }]} />,
    );
    const a = container.querySelector('a') as HTMLAnchorElement;
    expect(getByText('Open Compute')).toBeTruthy();
    expect(a.rel).toContain('noopener');

    const empty = render(<GroundedIn sources={[]} />);
    expect(empty.container.firstChild).toBeNull();
  });
});
