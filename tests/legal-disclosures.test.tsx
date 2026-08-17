import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegalApp } from '../src/legal/LegalApp';
import { FEATURES } from '../src/live/features/registry';
import {
  FEATURE_RISK_AUDIT,
  FEATURE_NOTICE_COPY,
  PUBLIC_ROUTE_RISK_AUDIT,
} from '../src/legal/featureRiskAudit';

// Opening a document anchors it to the top; jsdom does not implement window.scrollTo.
// tests/legal-scroll.test.tsx covers that behaviour.
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('app-wide important information', () => {
  it('covers the material AI, provider, privacy, emergency, rights, and action risks', () => {
    window.location.hash = '#/legal?from=live';
    render(<LegalApp />);

    expect(screen.getByRole('heading', { name: 'Important information' })).toBeInTheDocument();
    expect(screen.getByText(/citation, quotation, calculation, forecast/i)).toBeInTheDocument();
    expect(
      screen.getByText(/not an emergency, crisis, or monitoring service/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/prompts, attachments, conversation context/i)).toBeInTheDocument();
    expect(screen.getByText(/Remember off.*memory only until reload/i)).toBeInTheDocument();
    expect(screen.getByText(/encrypted ciphertext in this browser/i)).toBeInTheDocument();
    expect(screen.getByText(/same-origin request proxy/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Settings exports exclude provider and search keys/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/anything you type, paste, attach, or upload/i)).toBeInTheDocument();
    expect(screen.getByText(/work-related or personal material/i)).toBeInTheDocument();
    expect(screen.getByText(/rights and permission to use/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not guarantee ownership or non-infringement/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/check the destination, content, permissions/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Warranty and responsibility notice')).toHaveTextContent(
      'credential misuse, provider charges, or third-party processing or retention',
    );
    expect(screen.getByRole('link', { name: '← Back to Mavéa' })).toHaveAttribute('href', '#/live');
  });

  it('is a lazy public route linked from the landing without entering its normal bundle', () => {
    const routes = readFileSync(join(__dirname, '../src/routes.ts'), 'utf8');
    const landing = readFileSync(join(__dirname, '../src/flagship/FlagshipLanding.tsx'), 'utf8');

    expect(routes).toMatch(/defineRoute\('#\/legal',[\s\S]*?import\('\.\/legal\/LegalApp'\)/);
    expect(landing).toContain('AI can make mistakes. Verify important information.');
    expect(landing).toContain('href="#/legal?from=home"');
    expect(landing).not.toContain("from '../legal/LegalApp'");
  });

  it('has an explicit liability/privacy review for every registered public feature', () => {
    expect(Object.keys(FEATURE_RISK_AUDIT).sort()).toEqual(
      FEATURES.map((feature) => feature.id).sort(),
    );
    for (const feature of FEATURES) {
      const review = FEATURE_RISK_AUDIT[feature.id];
      expect(review, feature.id).toBeDefined();
      expect(review.reviewed.length, feature.id).toBeGreaterThan(0);
      if (review.notice !== 'global') expect(FEATURE_NOTICE_COPY[review.notice]).toBeDefined();
    }
  });

  it('has an explicit review for the landing and every public route', () => {
    const routes = readFileSync(join(__dirname, '../src/routes.ts'), 'utf8');
    const publicTable = routes.slice(
      routes.indexOf('const PUBLIC_ROUTES'),
      routes.indexOf('// QA/fidelity harnesses'),
    );
    const prefixes = [...publicTable.matchAll(/defineRoute\('([^']+)'/g)].map((match) => match[1]);
    expect(Object.keys(PUBLIC_ROUTE_RISK_AUDIT).sort()).toEqual(['landing', ...prefixes].sort());
  });

  it('places short, contextual notices at every high-risk workflow entry', () => {
    const files: Array<[string, RegExp]> = [
      ['../src/live/prism/PrismApp.tsx', /FeatureUseNotice kind="upload"/],
      ['../src/live/prism/SynthesisApp.tsx', /FeatureUseNotice kind="upload"/],
      ['../src/live/ripple/RippleOverlay.tsx', /FeatureUseNotice kind="code"/],
      ['../src/live/course/CoursesApp.tsx', /Learning aid, not an authority/],
      ['../src/live/course/CourseLessonReader.tsx', /FeatureUseNotice kind="learning"/],
      ['../src/live/deepzoom/DeepZoomApp.tsx', /FeatureUseNotice kind="learning"/],
      ['../src/live/srs/FlashcardsApp.tsx', /FeatureUseNotice kind="learning"/],
      ['../src/live/dashboards/DashboardsApp.tsx', /FeatureUseNotice kind="monitoring"/],
      ['../src/clip/ShareModal.tsx', /FeatureUseNotice kind="publishing"/],
      ['../src/export/ExportModal.tsx', /FeatureUseNotice kind="publishing"/],
      [
        '../src/clip/conversation/ConversationVideoStudio.tsx',
        /FeatureUseNotice kind="publishing"/,
      ],
      ['../src/live/delegate/DelegatePanel.tsx', /FeatureUseNotice kind="simulation"/],
      ['../src/live/delegate/TakeSeat.tsx', /FeatureUseNotice kind="simulation"/],
      ['../src/live/LiveApp.tsx', /FeatureUseNotice kind="voice-data"/],
      ['../src/live/LiveApp.tsx', /FeatureUseNotice kind="upload"/],
      ['../src/live/LiveSettings.tsx', /FeatureUseNotice kind="stored-data"/],
    ];

    for (const [path, pattern] of files) {
      expect(readFileSync(join(__dirname, path), 'utf8'), path).toMatch(pattern);
    }
  });

  it('does not make false local-only claims where providers or proxies are involved', () => {
    const share = readFileSync(join(__dirname, '../src/clip/ShareModal.tsx'), 'utf8');
    const ripple = readFileSync(join(__dirname, '../src/live/ripple/RippleOverlay.tsx'), 'utf8');
    const connect = readFileSync(
      join(__dirname, '../src/live/setup/steps/ConnectStep.tsx'),
      'utf8',
    );
    const tour = readFileSync(join(__dirname, '../src/tour/tourPlan.ts'), 'utf8');

    expect(share).not.toMatch(/Nothing leaves your device/i);
    expect(ripple).not.toMatch(/Nothing is uploaded|Never uploaded/i);
    expect(connect).not.toMatch(/sent directly to .* when used/i);
    expect(tour).not.toMatch(/sent directly to the provider/i);
  });

  it('discloses temporary video-export storage and interrupted cleanup precisely', () => {
    const privacy = readFileSync(join(__dirname, '../PRIVACY.md'), 'utf8');

    expect(privacy).toMatch(/origin-private browser storage/i);
    expect(privacy).toMatch(/crash, forced close, or storage failure can interrupt cleanup/i);
    expect(privacy).toMatch(/only Mavéa temporary video files more than 24 hours old/i);
    expect(privacy).toMatch(/up to 60 seconds while the browser takes ownership/i);
  });

  it('keeps the canonical disclaimer current about costs, patents, and asset rights', () => {
    const disclaimer = readFileSync(join(__dirname, '../DISCLAIMER.md'), 'utf8');

    expect(disclaimer).toContain('Effective: August 17, 2026');
    expect(disclaimer).toMatch(/container engines.*possible commercial subscription charges/is);
    expect(disclaimer).toMatch(/not a guarantee that no third party will assert patent rights/i);
    expect(disclaimer).toMatch(/do not necessarily clear privacy, publicity, trademark/i);
  });
});
