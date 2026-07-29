// The "Track this live" offer is the model's call: it scores 0–100 how worth-tracking the answer is,
// the validator keeps that score only when it reads cleanly, and the footer surfaces a quiet chip
// only above the threshold. These tests pin the schema coercion and the footer's rendering.
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateLiveResponse, FRONTIER_BLOCK_TYPES } from '../src/engine/liveSchema';
import { AnswerFooter } from '../src/live/voice/AnswerFooter';
import { TRACK_THRESHOLD } from '../src/live/dashboards/detect';
import type { ConversationSpec } from '../src/data/conversation';

afterEach(cleanup);

describe('schema buildTrack', () => {
  const payload = (track: unknown) => ({
    title: 'Burn rate',
    sub: '',
    narration: 'Here is the trend.',
    blocks: [{ type: 'insight', props: { title: 'Burn', body: 'x', conf: 90 } }],
    track,
  });

  it('keeps a valid judgement and clamps the score into 0–100', () => {
    const v = validateLiveResponse(
      payload({ score: 97, reason: 'weekly burn rate' }),
      FRONTIER_BLOCK_TYPES,
    );
    expect(v?.track).toEqual({ score: 97, reason: 'weekly burn rate' });
    expect(
      validateLiveResponse(payload({ score: 250, reason: 'r' }), FRONTIER_BLOCK_TYPES)?.track
        ?.score,
    ).toBe(100);
    expect(
      validateLiveResponse(payload({ score: -5, reason: 'r' }), FRONTIER_BLOCK_TYPES)?.track?.score,
    ).toBe(0);
  });

  it('accepts a numeric score written as a string', () => {
    expect(
      validateLiveResponse(payload({ score: '88', reason: 'r' }), FRONTIER_BLOCK_TYPES)?.track
        ?.score,
    ).toBe(88);
  });

  it('drops a malformed judgement whole', () => {
    const bad = [
      { reason: 'no score' },
      { score: 90 }, // no reason
      { score: 'high', reason: 'non-numeric score' },
      { score: 90, reason: '' },
      'not an object',
      {},
    ];
    for (const t of bad) {
      expect(validateLiveResponse(payload(t), FRONTIER_BLOCK_TYPES)?.track).toBeUndefined();
    }
  });
});

describe('AnswerFooter — track chip', () => {
  // A grounded answer by default — shouldOfferTrack requires real citations, so the chip's
  // positive cases must carry at least one source, and the sources-free case gets its own test.
  const spec = (
    track?: { score: number; reason: string },
    sources: { title: string; url: string }[] = [{ title: 'MLB.com', url: 'https://mlb.com' }],
  ) => ({ sources, track }) as unknown as ConversationSpec;

  it('shows the quiet chip only when the model scored above the threshold, and calls onTrack', () => {
    const onTrack = vi.fn();
    render(
      <AnswerFooter
        spec={spec({ score: TRACK_THRESHOLD, reason: 'monthly active users' })}
        followups={[]}
        onAsk={() => {}}
        onTrack={onTrack}
        busy={false}
      />,
    );
    const chip = screen.getByRole('button', { name: /track this live/i });
    expect(chip).toHaveAttribute('title', 'monthly active users');
    fireEvent.click(chip);
    expect(onTrack).toHaveBeenCalledTimes(1);
  });

  it('hides the chip below the threshold but keeps the universal AI disclaimer', () => {
    render(
      <AnswerFooter
        spec={spec({ score: TRACK_THRESHOLD - 1, reason: 'maybe' })}
        followups={[]}
        onAsk={() => {}}
        onTrack={() => {}}
        busy={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /track this live/i })).toBeNull();
    expect(screen.getByText(/AI-generated; may be inaccurate/i)).toBeInTheDocument();
  });

  it('does not show the chip when the model emitted no judgement', () => {
    render(
      <AnswerFooter
        spec={spec(undefined)}
        followups={[]}
        onAsk={() => {}}
        onTrack={() => {}}
        busy={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /track this live/i })).toBeNull();
  });

  it('hides the chip on an ungrounded answer even when the score clears the threshold', () => {
    // No citations = the model's memory; a dashboard seeded from memory would start life as a
    // made-up number wearing a live badge, so the offer never appears.
    render(
      <AnswerFooter
        spec={spec({ score: TRACK_THRESHOLD, reason: 'monthly active users' }, [])}
        followups={[]}
        onAsk={() => {}}
        onTrack={() => {}}
        busy={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /track this live/i })).toBeNull();
  });
});
