import { describe, it, expect } from 'vitest';
import { isTeachAsk } from '../src/live/annotate/teach';
import { getLiveConfigV2 } from '../src/live/useLiveConfig';

describe('isTeachAsk — asks that request the whiteboard treatment', () => {
  it('catches explicit teaching language', () => {
    expect(isTeachAsk('teach me how transistors work')).toBe(true);
    expect(isTeachAsk('Walk me through the numbers')).toBe(true);
    expect(isTeachAsk('explain it step by step')).toBe(true);
    expect(isTeachAsk("explain it like i'm five")).toBe(true);
  });

  it('stays quiet for ordinary questions', () => {
    expect(isTeachAsk('how do transistors work?')).toBe(false);
    expect(isTeachAsk('compare rents in austin and seattle')).toBe(false);
    expect(isTeachAsk('explain the chart')).toBe(false);
    expect(isTeachAsk(null)).toBe(false);
  });
});

describe('teach mode config', () => {
  it('defaults off — the pen is purposeful unless asked for', () => {
    expect(getLiveConfigV2().teachMode).toBe(false);
  });
});
