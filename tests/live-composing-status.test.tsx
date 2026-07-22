import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ComposingStatus } from '../src/live/turnstate/ComposingStatus';

afterEach(cleanup);

// The streaming cue must be announced, not just visible — a sighted user sees the dots, a screen
// reader hears the live status. Together with the reducer keeping `busy` true through streaming
// (see live-turnstate-reducer), this is what stops a partial canvas from reading as finished.
describe('ComposingStatus', () => {
  it('renders an accessible live status that says the answer is still composing', () => {
    render(<ComposingStatus />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/composing your answer/i);
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
