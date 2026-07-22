import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgBlock } from '../src/canvas/blocks/media/SvgBlock';

// SvgBlock renders the Tier-3 escape hatch: a sanitized, model-drawn SVG. These cover the
// render contract — safe markup reaches the DOM, a malicious payload never does, and bad
// input degrades to an honest fallback rather than a crash or a broken render.
describe('SvgBlock', () => {
  it('renders sanitized SVG content for a legitimate illustration', () => {
    const { container } = render(
      <SvgBlock
        title="Test diagram"
        svg='<svg viewBox="0 0 100 50"><circle cx="50" cy="25" r="20" fill="var(--presence)"/></svg>'
      />,
    );
    const svg = container.querySelector('.svgb-inner svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('circle')).not.toBeNull();
    // responsive sizing is enforced
    expect(svg?.getAttribute('width')).toBe('100%');
  });

  it('never lets a script payload reach the DOM', () => {
    const { container } = render(
      <SvgBlock
        title="Malicious"
        svg='<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><circle r="5"/></svg>'
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain('onload');
    expect(container.innerHTML.toLowerCase()).not.toContain('alert');
    // the legitimate shape still renders
    expect(container.querySelector('.svgb-inner circle')).not.toBeNull();
  });

  it('shows an honest fallback when the SVG cannot be rendered', () => {
    const { container, getByText } = render(<SvgBlock title="Broken" svg="not an svg at all" />);
    expect(container.querySelector('.svgb-inner')).toBeNull();
    expect(getByText(/couldn.t render/i)).toBeTruthy();
  });

  it('renders the title and optional caption', () => {
    const { getByText } = render(
      <SvgBlock
        title="Orbit"
        caption="Sizes are approximate"
        svg='<svg viewBox="0 0 10 10"><circle r="5"/></svg>'
      />,
    );
    expect(getByText('Orbit')).toBeTruthy();
    expect(getByText('Sizes are approximate')).toBeTruthy();
  });

  it('carries a "Generated" transparency badge (it is a model-drawn visual)', () => {
    const { container, getByText } = render(
      <SvgBlock title="Caffeine" svg='<svg viewBox="0 0 10 10"><circle r="5"/></svg>' />,
    );
    expect(getByText('Generated')).toBeTruthy();
    expect(container.querySelector('.svgb-badge')).not.toBeNull();
  });

  it('warns that a rendered generated visual can be inaccurate or entirely wrong', () => {
    const { getByRole, getByText } = render(
      <SvgBlock title="Concept" svg='<svg viewBox="0 0 10 10"><circle r="5"/></svg>' />,
    );
    expect(getByRole('note')).toBeTruthy();
    expect(getByText('AI-generated visual.')).toBeTruthy();
    expect(getByText(/inaccurate or entirely wrong/i)).toBeTruthy();
    expect(getByText(/do not treat it as evidence/i)).toBeTruthy();
  });
});
