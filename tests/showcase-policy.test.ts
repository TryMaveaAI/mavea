import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isShowcaseRoute } from '../src/showcasePolicy';
import { stashDemoPersona } from '../src/demo/demoEntry';
import { stashTourChapter, stashTourMode } from '../src/tour/tourEntry';
import { cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { createElement } from 'react';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('public showcase route boundary', () => {
  it.each(['', '#', '#/', '#/legal', '#/terms', '#/privacy'])('allows reading %s', (hash) => {
    expect(isShowcaseRoute(hash)).toBe(true);
  });

  it.each([
    '#/live',
    '#/live?settings=model',
    '#/live?demo=unknown',
    '#/live?tour=0',
    '#/live?tour=1&ch=settings&solo=1',
    '#/live?tour=1&ch=deepzoom&solo=1',
    '#/live?tour=1&ch=synthesis&solo=1',
    '#/live?tour=1&ch=manage-flashcards&solo=1',
    '#/live/anything?tour=1',
    '#/dashboards?demo=1',
    '#/gallery',
    '#/prism',
    '#/deepzoom?demo=1',
    '#/reel',
  ])('rejects application route %s', (hash) => {
    window.history.replaceState(null, '', hash);
    expect(isShowcaseRoute(hash)).toBe(false);
  });

  it.each(['#/live?tour=1', '#/live?demo=dev', '#/live?demo=dev&step=2'])(
    'allows a recorded deep link %s',
    (hash) => {
      window.history.replaceState(null, '', hash);
      expect(isShowcaseRoute(hash)).toBe(true);
    },
  );

  it('accepts the one-shot landing handoffs but does not let them authorize other routes', () => {
    stashDemoPersona('dev');
    expect(isShowcaseRoute('#/live')).toBe(true);
    expect(isShowcaseRoute('#/prism')).toBe(false);
    sessionStorage.clear();
    stashTourMode();
    expect(isShowcaseRoute('#/live')).toBe(true);
    expect(isShowcaseRoute('#/dashboards')).toBe(false);
  });

  it('rejects a stashed chapter that requires the local application', () => {
    stashTourMode();
    stashTourChapter('manage-flashcards');
    expect(isShowcaseRoute('#/live')).toBe(false);
  });

  it('refuses both navigation and preloading of a local-only surface in the public build', async () => {
    vi.stubEnv('MODE', 'showcase');
    vi.resetModules();
    const { routeFor, preloadRoute } = await import('../src/routes');
    expect(routeFor('#/live')).toBeNull();
    expect(preloadRoute('#/live')).toBeNull();
    expect(routeFor('#/gallery')).toBeNull();
    stashTourMode();
    expect(routeFor('#/live')).not.toBeNull();
  });

  it('cannot enable provider requests through configuration changes in the public build', async () => {
    vi.stubEnv('MODE', 'showcase');
    vi.resetModules();
    const policy = await import('../src/live/providers/spendPolicy');
    const config = { provider: 'gemini' as const, model: 'example-model', apiKey: 'example-key' };
    policy.configureProviderSpending(false);
    expect(policy.isProviderSpendingBlocked()).toBe(true);
    expect(policy.providerGenerationAllowed(config)).toBe(false);
    expect(() => policy.assertProviderGenerationAllowed(config)).toThrow(
      'Model spending is disabled during replays.',
    );
  });

  it('never starts microphone capture in the public build', async () => {
    vi.stubEnv('MODE', 'showcase');
    vi.resetModules();
    const { VadVoice } = await import('../src/voice/VadVoice');
    const start = vi.spyOn(VadVoice.prototype, 'start').mockImplementation(() => {});
    const { useVoiceController } = await import('../src/voice/useVoiceController');
    const { result, unmount } = renderHook(() => useVoiceController());
    result.current.start({ continuous: true, inCanvas: false });
    expect(start).not.toHaveBeenCalled();
    expect(result.current.capabilities.stt).toBe(false);
    expect(result.current.capabilities.canUseRealVoice).toBe(false);
    unmount();
    start.mockRestore();
  });

  it('uses captions without contacting a speech server in the public build', async () => {
    vi.stubEnv('MODE', 'showcase');
    vi.resetModules();
    const transport = vi.spyOn(globalThis, 'fetch');
    const { speakLine, primeLine } = await import('../src/voice/tts');
    primeLine('A recorded answer', 'mavea');
    const line = speakLine('A recorded answer', 'mavea');
    await expect(line.started).resolves.toBe(false);
    await expect(line.finished).resolves.toBe(false);
    expect(transport).not.toHaveBeenCalled();
    transport.mockRestore();
  });

  it('omits setup and prompt handoff chapters from the public walkthrough and its deep links', async () => {
    vi.stubEnv('MODE', 'showcase');
    vi.resetModules();
    const { TOUR, TOUR_EXTRAS, chapterById } = await import('../src/tour/tourPlan');
    expect(TOUR.some((chapter) => chapter.action.kind === 'connect' || chapter.handsBack)).toBe(
      false,
    );
    expect(chapterById('connect')).toBeUndefined();
    expect(chapterById('yours')).toBeUndefined();
    for (const id of ['settings', 'deepzoom', 'synthesis', 'manage-flashcards']) {
      expect(chapterById(id)).toBeUndefined();
      expect(TOUR_EXTRAS.some((chapter) => chapter.id === id)).toBe(false);
    }
    expect(chapterById('flashcards')).toBeDefined();
  });

  it('labels unavailable public feature demos as local-only', async () => {
    vi.stubEnv('MODE', 'showcase');
    vi.resetModules();
    const { FeatureIndex } = await import('../src/flagship/sections/FeatureIndex');
    render(createElement(FeatureIndex));
    for (const label of ['Deep Zoom', 'Synthesis', 'Manage flashcards']) {
      const article = screen.getByRole('heading', { name: label }).closest('article');
      expect(article).not.toBeNull();
      expect(within(article!).queryByRole('link')).toBeNull();
      expect(within(article!).getByText('In the local app')).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Watch Guide me' })).toHaveAttribute(
      'href',
      '#/live?tour=1&ch=study&solo=1',
    );
  });
});
