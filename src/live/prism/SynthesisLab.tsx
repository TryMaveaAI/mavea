// SynthesisLab — the #/synlab QA surface. Renders the Synthesis World from a canned settled corpus
// (demoSpec) so the map, lens switcher, and every object type can be inspected — light and dark —
// without a model call, the same way #/slidelab and #/exportlab preview their outputs. Not part of the
// Live path; a QA/visual-regression harness.
import { useEffect, useMemo, type ReactElement } from 'react';
import { applyTheme, readTheme } from '../../lib/theme';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { SynthesisOverlay } from './SynthesisOverlay';
import { DEMO_SPEC, DEMO_CORPUS } from './synthesis/demoSpec';

export function SynthesisLab(): ReactElement {
  useEffect(() => applyTheme(readTheme()), []);
  // The Live config as-is (default Gemini via the /llm proxy). Only the Ask dock uses it in demo mode.
  const cfg = useMemo(() => toModelConfig(getLiveConfigV2()), []);
  return (
    <SynthesisOverlay
      cfg={cfg}
      demo={{ spec: DEMO_SPEC, corpus: DEMO_CORPUS }}
      onClose={() => {
        window.location.hash = '#/';
      }}
    />
  );
}
