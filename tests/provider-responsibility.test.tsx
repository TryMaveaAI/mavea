import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProviderResponsibilityNotice } from '../src/live/setup/ProviderResponsibilityNotice';
import { VISIBLE_PROVIDERS } from '../src/live/providers/info';

describe('provider pricing and responsibility disclosure', () => {
  it('shows the essential billing, reliability, professional-advice, and user-responsibility terms', () => {
    render(<ProviderResponsibilityNotice />);
    const notice = screen.getByLabelText(
      'Provider billing, data sharing, and AI output responsibility',
    );
    expect(notice).toHaveTextContent('You provide the API keys or connected accounts');
    expect(notice).toHaveTextContent('providers bill you directly');
    expect(notice).toHaveTextContent('automatic and cadence-based features can repeat');
    expect(notice).toHaveTextContent('consume your quota or incur a third-party charge');
    expect(notice).toHaveTextContent('incomplete, inaccurate, offensive, or unsafe');
    expect(notice).toHaveTextContent('provided “as is,” without warranties');
    expect(notice).toHaveTextContent('Verify important information independently');
    expect(notice).toHaveTextContent('not medical, legal, financial, safety');
    expect(notice).toHaveTextContent(
      'not responsible for decisions, actions, losses, harm, or provider charges',
    );
    expect(notice).toHaveTextContent('at your own risk');
    expect(notice).toHaveTextContent('Anything you type, paste, attach, or upload');
    expect(notice).toHaveTextContent('work-related, personal, identifiable');
    expect(notice).toHaveTextContent('may be sent to the model, search, or connected provider');
    expect(notice).toHaveTextContent('authorized to share it');
    expect(notice).toHaveTextContent('processing and retention practices');
    expect(notice).toHaveTextContent('Choosing Remember stores an encrypted copy');
    expect(notice).toHaveTextContent('not a security guarantee');
    expect(notice).toHaveTextContent('compromised device, browser profile, or extension');
    expect(notice).toHaveTextContent(
      'not responsible for key theft, unauthorized use, or resulting charges',
    );
    expect(notice).toHaveTextContent('revoke a key with its provider immediately');
    expect(notice).toHaveTextContent(
      'restricted, revocable keys with spending caps on trusted devices you control',
    );
    expect(notice).toHaveTextContent('pass through this deployment’s request proxy');
    expect(notice).toHaveTextContent('settings exports exclude them');
    expect(screen.getByRole('link', { name: /Read all important information/i })).toHaveAttribute(
      'href',
      '#/legal?from=live',
    );
  });

  it('keeps model picker notes qualitative, with no prices or price-positioning language', () => {
    const notes = VISIBLE_PROVIDERS.flatMap((provider) =>
      Object.values(provider.modelNotes ?? {}),
    ).join(' ');
    expect(notes).not.toMatch(/\$|\b(?:cost|price|pricing|budget|cheapest)\b/i);
  });

  it('top-aligns the Connect fields and removes cost positioning from setup and Settings', () => {
    const css = readFileSync(join(__dirname, '../src/styles/setup-wizard.css'), 'utf8');
    const settings = readFileSync(join(__dirname, '../src/live/LiveSettings.tsx'), 'utf8');
    const think = readFileSync(join(__dirname, '../src/live/setup/steps/ThinkStep.tsx'), 'utf8');
    expect(css).toMatch(/\.field-grid\s*\{[^}]*align-items:\s*start/);
    expect(css).toMatch(/\.field-head \.card-eyebrow\s*\{[^}]*margin:\s*0/);
    expect(settings).not.toMatch(/no extra cost|extra cost|cheapest|snappy and cheap|pricier/i);
    expect(think).not.toMatch(/no extra cost|extra cost|cheapest|snappy and cheap|pricier/i);
  });
});
