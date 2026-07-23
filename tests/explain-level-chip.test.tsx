import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExplainLevelChip } from '../src/live/ExplainLevelChip';
import { getLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';

// The dock chip is a quick alternative to the Settings picker for the same explainLevel field —
// both must read/write it, so a change from either place shows up everywhere.
describe('ExplainLevelChip', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLiveConfig();
  });
  afterEach(() => cleanup());

  it('cycles Standard → In-depth → Simple → Standard, persisting each choice', () => {
    render(<ExplainLevelChip />);
    const btn = screen.getByRole('button', { name: /explanation level: standard/i });
    expect(btn).toHaveTextContent('Standard');

    fireEvent.click(btn);
    expect(getLiveConfigV2().explainLevel).toBe('deep');
    const deep = screen.getByRole('button', { name: /explanation level: in-depth/i });
    expect(deep).toHaveTextContent('In-depth');

    fireEvent.click(deep);
    expect(getLiveConfigV2().explainLevel).toBe('simple');
    const simple = screen.getByRole('button', { name: /explanation level: simple/i });
    expect(simple).toHaveTextContent('Simple');

    fireEvent.click(simple);
    expect(getLiveConfigV2().explainLevel).toBe('standard');
  });

  it('announces where the next tap goes, not just where it is', () => {
    render(<ExplainLevelChip />);
    expect(
      screen.getByRole('button', { name: 'Explanation level: Standard. Tap for In-depth.' }),
    ).toBeInTheDocument();
  });
});
