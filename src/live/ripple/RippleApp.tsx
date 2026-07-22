// RippleApp — standalone surface for the Ripple feature at #/ripple. Renders the full
// RippleOverlay immediately with the seed PR so users see the value without needing a
// conversation first. The overlay's own input lets them paste a real diff or PR URL.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { homeTarget } from '../../lib/homeTarget';
import { applyTheme, readTheme } from '../../lib/theme';
import { AsyncSurface } from '../../components/AsyncSurface';
import { createPreloadableLazy } from '../../lib/preloadableLazy';
import type { ModelConfig } from '../../types/mavea';
import type { ShipModel } from './model';
import { SurfaceFallback } from '../../RootBoundary';
import { lazyRetry } from '../../lib/lazyRetry';

const rippleWorkbench = createPreloadableLazy(() =>
  import('./RippleOverlay').then((m) => ({ default: m.RippleOverlay })),
);
const RippleOverlay = rippleWorkbench.Component;
const loadSeed = lazyRetry(() => import('./seed'));

export function RippleApp(): ReactElement {
  useEffect(() => applyTheme(readTheme()), []);

  // Keep the worked example out of the route shell. On a slow connection this lets the shared
  // loading face acknowledge the navigation immediately while the example and workbench stream
  // in together, instead of showing an apparently blank page while a data-heavy chunk parses.
  const [model, setModel] = useState<ShipModel | null>(null);
  useEffect(() => {
    let live = true;
    void rippleWorkbench.preload().catch(() => {});
    void loadSeed().then(({ SEED_SHIP }) => {
      if (live) setModel(SEED_SHIP);
    });
    return () => {
      live = false;
    };
  }, []);

  const [cfg, setCfg] = useState<ModelConfig | null>(null);
  useEffect(() => {
    let live = true;
    // The worked example is fully deterministic, so paint it first. Provider adapters and the
    // encrypted config vault hydrate shortly after the first frame instead of competing with it
    // for parse/compile time on a slow laptop.
    const timer = window.setTimeout(() => {
      void import('../useLiveConfig').then(({ getLiveConfigV2, toModelConfig }) => {
        if (!live) return;
        const model = toModelConfig(getLiveConfigV2());
        // Only pass a cfg when an API key is configured — the overlay degrades gracefully to null.
        setCfg(model.apiKey ? model : null);
      });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Wires the narration toggle to real speech; the toggle itself (default off) is what keeps
  // Ripple silent-by-default — this just makes it work once someone opts in.
  const say = useCallback((text: string) => {
    void import('../../voice/tts').then((m) => m.speak(text, 'mavea'));
  }, []);

  if (!model) return <SurfaceFallback />;

  return (
    <AsyncSurface label="Ripple overview">
      <RippleOverlay
        model={model}
        cfg={cfg}
        speak={say}
        onClose={() => {
          window.location.hash = homeTarget().href;
        }}
      />
    </AsyncSurface>
  );
}
