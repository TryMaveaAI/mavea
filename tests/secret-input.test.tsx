import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { SecretInput } from '../src/lib/SecretInput';

// A controlled <input> has its value mirrored into the `value` ATTRIBUTE, where an extension,
// a DOM snapshot or a CSS attribute selector can read it. A key field must only ever hold the key
// in the live property.
describe('SecretInput keeps a key out of the DOM', () => {
  it('shows the value without writing it as an attribute', () => {
    const { container } = render(
      <SecretInput type="password" value="sk-test-123" onChange={() => {}} />,
    );
    const input = container.querySelector('input')!;
    expect(input.value).toBe('sk-test-123');
    expect(input.hasAttribute('value')).toBe(false);
    expect(container.innerHTML).not.toContain('sk-test-123');
  });

  it('reports typing and follows a value the parent changes, still without the attribute', () => {
    const seen = vi.fn();
    function Field() {
      const [key, setKey] = useState('');
      return (
        <>
          <SecretInput
            type="password"
            value={key}
            onChange={(e) => {
              seen(e.target.value);
              setKey(e.target.value);
            }}
          />
          <button type="button" onClick={() => setKey('')}>
            Clear
          </button>
        </>
      );
    }
    const { container, getByText } = render(<Field />);
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'sk-typed' } });
    expect(seen).toHaveBeenCalledWith('sk-typed');
    expect(input.value).toBe('sk-typed');
    fireEvent.click(getByText('Clear'));
    expect(input.value).toBe('');
    expect(input.hasAttribute('value')).toBe(false);
  });
});
