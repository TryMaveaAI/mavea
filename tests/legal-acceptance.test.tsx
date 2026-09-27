import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGAL_ACCEPTANCE_STORAGE_KEY,
  LEGAL_ACCEPTANCE_VERSION,
  acceptLegalTerms,
  hasLegalAcceptance,
  resetLegalAcceptance,
} from '../src/legal/acceptance';
import { LegalGate } from '../src/legal/LegalGate';
import { isLegalGateBypassed } from '../src/legal/routePolicy';
import { PUBLIC_ROUTES } from '../src/routeTable';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function NetworkChild() {
  useEffect(() => {
    void fetch('/llm/provider', { method: 'POST', body: 'Explain this' });
  }, []);
  return <div>Connected product mounted</div>;
}

describe('versioned legal acknowledgement', () => {
  it('stores a version and timestamp and can be reset', () => {
    expect(hasLegalAcceptance()).toBe(false);
    expect(acceptLegalTerms(new Date('2026-07-16T12:00:00.000Z'))).toBe(true);
    expect(JSON.parse(localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY)!)).toEqual({
      version: LEGAL_ACCEPTANCE_VERSION,
      acceptedAt: '2026-07-16T12:00:00.000Z',
    });
    resetLegalAcceptance();
    expect(hasLegalAcceptance()).toBe(false);
  });

  it('rejects malformed, incomplete, and stale records', () => {
    localStorage.setItem(LEGAL_ACCEPTANCE_STORAGE_KEY, '{bad json');
    expect(hasLegalAcceptance()).toBe(false);
    localStorage.setItem(
      LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: 'old', acceptedAt: new Date().toISOString() }),
    );
    expect(hasLegalAcceptance()).toBe(false);
    localStorage.setItem(
      LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: LEGAL_ACCEPTANCE_VERSION }),
    );
    expect(hasLegalAcceptance()).toBe(false);
  });

  it('requires renewed acceptance after the August 2026 commercial-clearance update', () => {
    localStorage.setItem(
      LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({
        version: '2026-07-16-commercial-clearance-v4',
        acceptedAt: '2026-07-16T12:00:00.000Z',
      }),
    );
    expect(hasLegalAcceptance()).toBe(false);
  });
});

describe('LegalGate', () => {
  it('does not mount connected product code until the checkbox is accepted', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <LegalGate>
        <NetworkChild />
      </LegalGate>,
    );

    expect(screen.queryByText('Connected product mounted')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Mavéa relies on artificial intelligence and on third-party services/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /though it may be a remote service\), and the resulting transcript may be sent/i,
      ),
    ).toBeInTheDocument();
    // The box covers what the reader was just shown, not only the documents behind the links.
    expect(
      screen.getByText(/I have read and understand the points above, I agree to the Terms of Use/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/I alone am responsible for avoiding sensitive conversations/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      '#/terms?from=live',
    );
    expect(screen.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute(
      'href',
      '#/privacy?from=live',
    );
    expect(screen.getByRole('link', { name: 'Disclaimer' })).toHaveAttribute(
      'href',
      '/legal/DISCLAIMER.md',
    );
    expect(screen.getByRole('link', { name: 'License' })).toHaveAttribute(
      'href',
      '/legal/LICENSE.txt',
    );

    // Speech consent is its own affirmative act: the general acknowledgement alone must not open
    // the door, and neither must the speech one alone.
    const continueButton = screen.getByRole('button', { name: /continue to mavéa/i });
    const [generalConsent, speechConsent] = screen.getAllByRole('checkbox');
    expect(continueButton).toBeDisabled();
    fireEvent.click(generalConsent);
    expect(continueButton).toBeDisabled();
    fireEvent.click(generalConsent);
    fireEvent.click(speechConsent);
    expect(continueButton).toBeDisabled();
    fireEvent.click(generalConsent);
    fireEvent.click(continueButton);

    expect(screen.getByText('Connected product mounted')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(hasLegalAcceptance()).toBe(true);
  });

  it('fails closed when acknowledgement cannot be persisted', async () => {
    // Storage objects are spec-mandated proxies (assigning a property records it as a stored item
    // rather than shadowing the method), and newer Node ships its own Web Storage whose methods
    // aren't reachable through jsdom's Storage.prototype — method patching misses on one runtime
    // or the other. Swap the whole global for a store whose writes always fail instead;
    // afterEach's unstubAllGlobals restores the real one.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    render(
      <LegalGate>
        <div>Connected product mounted</div>
      </LegalGate>,
    );
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /continue to mavéa/i }));
    // Assert via findBy/waitFor rather than a synchronous queryBy: the click's state update is
    // scheduled through the same microtask queue as any environment-level timer flushing, so an
    // immediate synchronous read isn't guaranteed to observe the post-click render everywhere.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not save your acknowledgement/i,
    );
    expect(screen.queryByText('Connected product mounted')).toBeNull();
  });

  it('allows an explicitly bypassed prerecorded surface without storing acceptance', () => {
    render(
      <LegalGate bypass>
        <div>Recorded demo</div>
      </LegalGate>,
    );
    expect(screen.getByText('Recorded demo')).toBeInTheDocument();
    expect(localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();
  });

  it('dismisses an already-open gate when acceptance arrives from ANOTHER tab', () => {
    // The stale-gate bug: a tab open before the user accepted elsewhere kept demanding
    // acknowledgement until a hard reload. Acceptance in another tab reaches this one as a
    // 'storage' event — the gate must re-check and let the user through, not sit stale.
    render(
      <LegalGate>
        <div>Connected product mounted</div>
      </LegalGate>,
    );
    expect(screen.queryByText('Connected product mounted')).toBeNull();

    // Another tab writes the acceptance; this tab only hears about it via the storage event.
    localStorage.setItem(
      LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: LEGAL_ACCEPTANCE_VERSION, acceptedAt: new Date().toISOString() }),
    );
    fireEvent(window, new StorageEvent('storage', { key: LEGAL_ACCEPTANCE_STORAGE_KEY }));

    expect(screen.getByText('Connected product mounted')).toBeInTheDocument();
  });

  it('re-locks an open surface when the acceptance is reset', () => {
    acceptLegalTerms();
    render(
      <LegalGate>
        <div>Connected product mounted</div>
      </LegalGate>,
    );
    expect(screen.getByText('Connected product mounted')).toBeInTheDocument();
    // resetLegalAcceptance notifies the store, so the gate returns without a reload.
    act(() => resetLegalAcceptance());
    expect(screen.queryByText('Connected product mounted')).toBeNull();
  });
});

describe('legal-gate route policy', () => {
  const OPEN = new Set(['#/terms', '#/privacy', '#/legal']);

  it('leaves only the landing and the documents open', () => {
    expect(isLegalGateBypassed('')).toBe(true);
    expect(isLegalGateBypassed('#/')).toBe(true);
    for (const doc of OPEN) expect(isLegalGateBypassed(doc)).toBe(true);
  });

  it('gates every other public route, so a new one is gated by default', () => {
    for (const { prefix } of PUBLIC_ROUTES) {
      if (OPEN.has(prefix)) continue;
      expect(isLegalGateBypassed(prefix), prefix).toBe(false);
    }
  });

  it('gates prerecorded examples and the tour, however they are reached', () => {
    for (const hash of [
      '#/live?demo=pm',
      '#/live?tour=1',
      '#/live?demo=pm&settings=model',
      '#/live?ripple=1',
      '#/deepzoom?demo=1',
      '#/synthesis?demo=1',
      '#/gallery',
    ]) {
      window.location.hash = hash;
      expect(isLegalGateBypassed(hash), hash).toBe(false);
    }
    // A handoff left in session storage by an in-app link is not a way past it either.
    sessionStorage.setItem('mavea-demo-persona', 'pm');
    sessionStorage.setItem('mavea-tour-mode', '1');
    expect(isLegalGateBypassed('#/live')).toBe(false);
    sessionStorage.clear();
  });
});

describe('the gate says what kind of visit this is', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('welcomes a first visit, and says the terms changed only to someone who accepted before', () => {
    render(<LegalGate>{null}</LegalGate>);
    expect(screen.getByText('Welcome to Mavéa')).toBeInTheDocument();
    cleanup();

    localStorage.setItem(
      LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: '2026-01-01-older', acceptedAt: '2026-01-01T00:00:00.000Z' }),
    );
    render(<LegalGate>{null}</LegalGate>);
    expect(screen.getByText('Our terms have changed')).toBeInTheDocument();
  });
});
