import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const live = readFileSync(join(import.meta.dirname, '../src/live/LiveApp.tsx'), 'utf8');

describe('Watch Me Think controls', () => {
  it('is an explicit composer intent with a deterministic Done thinking action', () => {
    expect(live).toContain("'Watch me think'");
    expect(live).toContain("'Done thinking'");
    expect(live).toContain('finishWatchThinking()');
    expect(live).toContain('Finish now without waiting for silence');
    expect(live).toContain('aria-label={watchThinkingActionLabel}');
  });

  it('does not auto-route ordinary speech through a thinking-aloud text heuristic', () => {
    expect(live).not.toContain('looksLikeThinkingAloud');
    expect(live).not.toContain('Smart default:');
  });

  it('keeps quiet settling as a bounded fallback, not the only completion path', () => {
    expect(live).toMatch(/const SETTLE_SILENCE_MS = 6400/);
    expect(live).toContain('finishWatchPendingRef');
  });
});
