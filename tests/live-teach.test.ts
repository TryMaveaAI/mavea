import { afterEach, describe, it, expect, vi } from 'vitest';
import { isTeachAsk } from '../src/live/annotate/teach';
import { getLiveConfigV2, importConfig, resetLiveConfig } from '../src/live/useLiveConfig';

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

// Pen mode is one toggle over two fields. Teach mode used to default off under a toggle that
// defaulted on, so the switch said "on" while the generous pen stayed off.
describe('teach mode config', () => {
  afterEach(() => {
    localStorage.clear();
    resetLiveConfig();
  });

  async function freshFrom(stored: Record<string, unknown>) {
    vi.resetModules();
    localStorage.setItem('mavea-live-v2', JSON.stringify(stored));
    return (await import('../src/live/useLiveConfig')).getLiveConfigV2();
  }

  it('defaults on, agreeing with the Pen mode toggle', () => {
    const cfg = getLiveConfigV2();
    expect(cfg.annotationsEnabled).toBe(true);
    expect(cfg.teachMode).toBe(true);
  });

  it('reads a stored pair from before the change as on', async () => {
    const cfg = await freshFrom({ annotationsEnabled: true, teachMode: false });
    expect(cfg.teachMode).toBe(true);
  });

  it('keeps a reader who turned the pen off, off', async () => {
    const cfg = await freshFrom({ annotationsEnabled: false, teachMode: false });
    expect(cfg.annotationsEnabled).toBe(false);
    expect(cfg.teachMode).toBe(false);
  });

  it('imports a settings file exported before the change as on', () => {
    const cfg = importConfig(JSON.stringify({ annotationsEnabled: true, teachMode: false }));
    expect(cfg.teachMode).toBe(true);
    expect(importConfig(JSON.stringify({ annotationsEnabled: false })).teachMode).toBe(false);
  });
});
