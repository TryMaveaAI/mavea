// SynthesisOverlay.tsx — the Synthesis World is now a THIN wrapper over Prism's own overlay, not a
// parallel view. It runs the corpus pipeline (useSynthesisWorld), presents the settled CorpusSpec as a
// PrismSpec (adapt.ts), positions the corpus objects against the same layout (layoutCorpus), and
// hands both to PrismOverlay via its `world` + `corpusChrome` props. The result: corpus mode inherits
// every Prism feature — typed cards, rendered source panels, cross-source threads, and the full toolbar
// (Brief me, Cross-examine, Live levers, Check the numbers, Annotate) — and adds only what's corpus-
// specific: the 4-way lens and the gap/consensus objects. One rich view, two scales.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Attachment } from '../attachments';
import type { ModelConfig } from '../../types/mavea';
import type { SearchProviderId } from '../search/types';
import { PrismOverlay, type ExternalWorld, type CorpusChrome } from './PrismOverlay';
import { useSynthesisWorld } from './useSynthesisWorld';
import { layoutCorpus, type CorpusLayout } from './synthesis/layoutCorpus';
import { layoutCorpusOffMain } from './layoutOffMain';
import { corpusToPrismSpec } from './synthesis/adapt';
import type { CorpusSpec, Lens } from './synthesis/types';

// Palette is passed to layoutCorpus only to place objects; card/region COLORS come from Prism's own
// REGION_PALETTE, and layout POSITIONS are palette-independent — so any accents work here.
const THEME_PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--insight-soft)',
  'var(--danger)',
];

export interface SynthesisOverlayProps {
  sources?: readonly Attachment[];
  cfg: ModelConfig;
  search?: { enabled: boolean; providerId: SearchProviderId; apiKey?: string };
  onClose: () => void;
  /** Preview mode (#/synlab): render an already-settled corpus without a model call. */
  demo?: { spec: CorpusSpec; corpus: string[][] };
}

export function SynthesisOverlay({
  sources,
  cfg,
  search,
  onClose,
  demo,
}: SynthesisOverlayProps): ReactElement {
  const live = useSynthesisWorld(cfg);
  const phase = demo ? 'settled' : live.phase;
  const corpusSpec = demo ? demo.spec : live.spec;
  const corpusText = demo ? demo.corpus : live.corpus;

  // Run the pipeline on mount / when the pile changes (skipped in preview mode).
  useEffect(() => {
    if (demo) return;
    if (sources && sources.length > 0) live.synthesize(sources);
    return () => live.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const [lens, setLens] = useState<Lens>('all');

  // Position the corpus objects against the same layout Prism will use (deterministic → aligned).
  const [largeLayout, setLargeLayout] = useState<{
    spec: CorpusSpec;
    result: CorpusLayout;
  } | null>(null);
  useEffect(() => {
    if (!corpusSpec || corpusSpec.claims.length < 48) return;
    let active = true;
    void layoutCorpusOffMain(corpusSpec, THEME_PALETTE).then((result) => {
      if (active) setLargeLayout({ spec: corpusSpec, result });
    });
    return () => {
      active = false;
    };
  }, [corpusSpec]);
  const placed = useMemo(() => {
    if (!corpusSpec) return null;
    if (corpusSpec.claims.length < 48) return layoutCorpus(corpusSpec, THEME_PALETTE);
    return largeLayout?.spec === corpusSpec ? largeLayout.result : null;
  }, [corpusSpec, largeLayout]);
  const pdfSpec = useMemo(() => (corpusSpec ? corpusToPrismSpec(corpusSpec) : null), [corpusSpec]);
  const sourceLabel = useCallback(
    (s: number): string => corpusSpec?.sources[s]?.label ?? `Source ${s + 1}`,
    [corpusSpec],
  );

  // The attachments backing the source panels: the real surviving files (aligned to claim.source), or
  // — in preview mode — name-only stand-ins that carry no bytes. That's enough because the panel reads
  // its page text from `world.corpus` (the same pages the claims were grounded against), never by
  // re-extracting the attachment.
  const attachments: Attachment[] = useMemo(() => {
    if (demo)
      return (demo.spec.sources ?? []).map((s) => ({
        name: s.fileName,
        mime: 'text/plain',
        data: '',
        size: 0,
      }));
    return (live.sourcesAtt ?? sources ?? []).slice();
  }, [demo, live.sourcesAtt, sources]);

  // In preview mode there's no live pipeline run to report a pre-grounding count from — the demo spec
  // is already-settled, so "proposed" reads the same as "grounded" (no drop line, which is correct: a
  // canned fixture never drops anything to be honest about).
  const world: ExternalWorld = {
    phase,
    spec: pdfSpec,
    corpus: corpusText,
    proposed: demo ? (corpusSpec?.claims.length ?? 0) : live.proposed,
    error: live.error,
    stage: live.stage,
  };

  const corpusChrome: CorpusChrome | undefined =
    corpusSpec && placed
      ? {
          lens,
          setLens,
          counts: corpusSpec.counts,
          contradictions: placed.contradictions,
          gaps: placed.gaps,
          consensus: placed.consensus,
          sourceLabel,
        }
      : undefined;

  return (
    <PrismOverlay
      pdf={attachments}
      // Preview mode is a settled, canned world. Null keeps Ask/Verify/Why/Levers controls from
      // turning exploration of that prerecorded surface into a provider-backed request.
      cfg={demo ? null : cfg}
      {...(search ? { search } : {})}
      onClose={onClose}
      world={world}
      {...(corpusChrome ? { corpusChrome } : {})}
    />
  );
}
