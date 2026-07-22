import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnderstoodPanel } from '../src/live/understand/UnderstoodPanel';

// "Edit its mind": chips render as the model stated them; tapping opens an in-place edit;
// committing a REAL change fires one onFix(before, after); a no-op edit fires nothing.

afterEach(cleanup);

const CHIPS = ['Tokyo trip', 'traveling solo', '~$2,500 each'];

describe('UnderstoodPanel', () => {
  it('renders every chip under the fix-it label', () => {
    render(<UnderstoodPanel chips={CHIPS} onFix={vi.fn()} />);
    expect(screen.getByText(/What I understood/i)).toBeInTheDocument();
    for (const c of CHIPS) expect(screen.getByText(c)).toBeInTheDocument();
  });

  it('explains the section with an accessible tooltip', () => {
    render(<UnderstoodPanel chips={CHIPS} onFix={vi.fn()} />);
    const help = screen.getByRole('button', { name: /what this section means/i });
    expect(help).toHaveAccessibleDescription(/assumptions it used/i);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/tap that chip and correct it/i);
  });

  it('renders nothing at all when the turn carried no chips', () => {
    const { container } = render(<UnderstoodPanel chips={[]} onFix={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('tap → edit → Enter fires onFix with the before and after', () => {
    const onFix = vi.fn();
    render(<UnderstoodPanel chips={CHIPS} onFix={onFix} />);
    fireEvent.click(screen.getByText('traveling solo'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'with Sam' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onFix).toHaveBeenCalledWith('traveling solo', 'with Sam');
  });

  it('an unchanged or emptied edit fires nothing; Escape cancels', () => {
    const onFix = vi.fn();
    render(<UnderstoodPanel chips={CHIPS} onFix={onFix} />);
    fireEvent.click(screen.getByText('Tokyo trip'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); // unchanged
    fireEvent.click(screen.getByText('Tokyo trip'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onFix).not.toHaveBeenCalled();
    // Back to chips after both.
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
