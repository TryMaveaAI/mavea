import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MediaCard } from '../src/canvas/blocks/media/MediaCard';

// `title` is every block's framing eyebrow, and a model writes it that way here too ("A film to
// study before the cut"), so the work itself has to be named somewhere else or the card
// recommends something it never identifies.
describe('MediaCard — names the work apart from the framing line', () => {
  it('shows the name as the card heading, separate from the eyebrow', () => {
    const { container } = render(
      <MediaCard title="Tonight's pick" name="Arrival" cover={{}} year="2016" />,
    );
    expect(container.querySelector('.card-eyebrow')?.textContent).toContain("Tonight's pick");
    expect(container.querySelector('h3.mc-name')?.textContent).toBe('Arrival');
  });

  it('draws no empty heading when the name is missing', () => {
    const { container } = render(<MediaCard title="Arrival" cover={{}} />);
    expect(container.querySelector('.mc-name')).toBeNull();
  });
});
