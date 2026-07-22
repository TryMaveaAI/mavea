import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Lifeline } from '../src/canvas/blocks/layout/Lifeline';

// Lifeline is force-selected on crisis turns, so its model-supplied hrefs are the one place a
// link must never be dangerous or dead. A rejected href keeps the resource fully visible as
// plain text — the number in `contact` is the lifeline itself, the anchor is only a convenience.

afterEach(cleanup);

describe('Lifeline href gating', () => {
  it('renders a tappable anchor for a valid tel: resource', () => {
    const { container } = render(
      <Lifeline
        resources={[
          { name: '988 Suicide & Crisis Lifeline', contact: 'Call or text 988', href: 'tel:988' },
        ]}
      />,
    );
    const a = container.querySelector('a.lfl-res--link');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('tel:988');
  });

  it('drops the anchor but keeps the resource text for a javascript: href', () => {
    const { container } = render(
      <Lifeline
        resources={[{ name: 'Helpline', contact: 'Call 111', href: 'javascript:alert(1)' }]}
      />,
    );
    expect(container.querySelector('a')).toBeNull();
    const row = container.querySelector('.lfl-res');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Helpline');
    expect(row!.textContent).toContain('Call 111');
  });
});
