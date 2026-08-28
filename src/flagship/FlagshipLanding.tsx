// The flagship landing — Mavéa's front door. A presentational page composed of self-contained
// sections; all behavior is passed in from FlagshipHost.tsx so this owns no app state. The
// living Presence face is rendered by the host shell and floats above the hero (the hero
// reserves space for it), then docks into the topbar as you scroll. Section order is the
// designed narrative: hook, prove, then play. Demo cards hand off to Live's curated replay mode
// via onPlay — prerecorded model output with scripted feature choreography on the real surface.
import { lazy, Suspense, type ReactNode } from 'react';
import type { DemoCastMember } from '../demo/cast';
import { legalDocumentHref } from '../legal/links';
import { Reveal } from './parts';
import { Hero } from './sections/Hero';
import './flagship.css';

// The hero is the first paint. Every other narrative section sits below it and is split + mounted
// only as it approaches the viewport, so a first visit does not parse/render the entire long page
// before the primary composer can answer. Reserved section heights keep the scroll track stable.
const SignatureLoop = lazy(() =>
  import('./sections/SignatureLoop').then((m) => ({ default: m.SignatureLoop })),
);
const WowFeatures = lazy(() =>
  import('./sections/WowFeatures').then((m) => ({ default: m.WowFeatures })),
);
const FlagshipShowcase = lazy(() =>
  import('./sections/FlagshipShowcase').then((m) => ({ default: m.FlagshipShowcase })),
);
const SeeDontRead = lazy(() =>
  import('./sections/SeeDontRead').then((m) => ({ default: m.SeeDontRead })),
);
const HonestByDesign = lazy(() =>
  import('./sections/HonestByDesign').then((m) => ({ default: m.HonestByDesign })),
);
const DemoGallery = lazy(() =>
  import('./sections/DemoGallery').then((m) => ({ default: m.DemoGallery })),
);
const TwoSurfaces = lazy(() =>
  import('./sections/TwoSurfaces').then((m) => ({ default: m.TwoSurfaces })),
);
const FlagshipCTA = lazy(() =>
  import('./sections/FlagshipCTA').then((m) => ({ default: m.FlagshipCTA })),
);

function DeferredSection({
  children,
  className = 'fl-narrow',
  id,
  reserve,
  onIntent,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  reserve: number;
  onIntent?: () => void;
}) {
  return (
    <Reveal className={className} id={id} onIntent={onIntent} defer reserve={reserve}>
      <Suspense fallback={<div className="fl-section-loading" aria-hidden="true" />}>
        {children}
      </Suspense>
    </Reveal>
  );
}

export const DEMO_ANCHOR = 'flagship-demo';

interface Props {
  onPlay: (p: DemoCastMember) => void;
  onPlayStudyDemo: () => void;
  onEnterLive: (seed?: string) => void;
  /** Warm the Live provider/TTS connections ahead of time (fired when the composer is focused),
   *  so a click-through into Live doesn't pay cold-start latency on the first turn. */
  onWarm?: () => void;
  /** Fired the moment the user reaches toward the demos (hover/focus/touch on the demo section,
   *  or "Watch it work") — the host warms the Live surface the cards hand off into. */
  onDemoIntent?: () => void;
  /** Show the first-run "play the tour, or explore on your own" invite in the hero, in place of
   *  the plain "Watch it work" link. One-shot — App.tsx retires it the moment either choice fires. */
  showTourInvite?: boolean;
  onPlayTour?: () => void;
  onDismissTourInvite?: () => void;
  onViewWorld?: () => void;
}

export function FlagshipLanding({
  onPlay,
  onPlayStudyDemo,
  onEnterLive,
  onWarm,
  onDemoIntent,
  showTourInvite,
  onPlayTour,
  onDismissTourInvite,
  onViewWorld,
}: Props) {
  return (
    <div className="fl-landing">
      <Reveal className="fl-hero-section">
        <Hero
          onEnterLive={onEnterLive}
          onPlayStudyDemo={onPlayStudyDemo}
          onWarm={onWarm}
          showTourInvite={showTourInvite}
          onPlayTour={onPlayTour}
          onDismissTourInvite={onDismissTourInvite}
          onViewWorld={onViewWorld}
        />
      </Reveal>

      <DeferredSection reserve={940}>
        <SignatureLoop />
      </DeferredSection>

      <DeferredSection reserve={1380}>
        <WowFeatures />
      </DeferredSection>

      <DeferredSection reserve={1040}>
        <FlagshipShowcase onEnterLive={onEnterLive} />
      </DeferredSection>

      <DeferredSection reserve={600}>
        <SeeDontRead />
      </DeferredSection>

      <DeferredSection reserve={520}>
        <HonestByDesign />
      </DeferredSection>

      <DeferredSection className="fl-wide" id={DEMO_ANCHOR} reserve={680} onIntent={onDemoIntent}>
        <DemoGallery onPlay={onPlay} />
      </DeferredSection>

      <DeferredSection reserve={620}>
        <TwoSurfaces onEnterLive={onEnterLive} />
      </DeferredSection>

      <DeferredSection className="fl-cta-section" reserve={600}>
        <FlagshipCTA onEnterLive={onEnterLive} />
      </DeferredSection>

      <footer className="fl-legal-footer">
        <span>AI can make mistakes. Verify important information.</span>
        <nav aria-label="Legal and safety information">
          <a href="#/terms?from=home">Terms</a>
          <a href="#/privacy?from=home">Privacy</a>
          <a href="#/legal?from=home">Important information</a>
          <a href={legalDocumentHref('LICENSE.txt')} target="_blank" rel="noreferrer noopener">
            License
          </a>
        </nav>
      </footer>
    </div>
  );
}
