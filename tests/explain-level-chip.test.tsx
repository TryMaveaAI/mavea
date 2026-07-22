import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExplainLevelChip } from '../src/live/ExplainLevelChip';
import { getLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';

// The dock chip is a quick alternative to the Settings toggle for the same explainLevel field —
// both must read/write it, so a change from either place shows up everywhere.
describe('ExplainLevelChip', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLiveConfig();
  });
  afterEach(() => cleanup());

  it('starts on Standard and flips to Simple on tap, persisting the choice', () => {
    render(<ExplainLevelChip />);
    const btn = screen.getByRole('button', { name: /explanation level: standard/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);
    expect(getLiveConfigV2().explainLevel).toBe('simple');
    const flipped = screen.getByRole('button', { name: /explanation level: simple/i });
    expect(flipped).toHaveAttribute('aria-pressed', 'true');
    expect(flipped).toHaveTextContent('Simple');

    fireEvent.click(flipped);
    expect(getLiveConfigV2().explainLevel).toBe('standard');
  });
});
