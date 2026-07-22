import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs gateway module, no types
import * as gatewayGuard from '../gateway/guard.mjs';

const {
  originAllowed,
  secretOk,
  createOAuthStateStore,
  createActionConfirmationStore,
  assertGatewayConfig,
} = gatewayGuard;

const ALLOWED = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

describe('gateway originAllowed (CSRF gate)', () => {
  it('allows a same-origin request from the app', () => {
    expect(originAllowed({ origin: 'http://localhost:5173' }, ALLOWED)).toBe(true);
  });
  it('blocks a cross-origin request (the CSRF case)', () => {
    expect(originAllowed({ origin: 'https://evil.example' }, ALLOWED)).toBe(false);
  });
  it('falls back to Referer when Origin is absent', () => {
    expect(originAllowed({ referer: 'http://localhost:5173/live' }, ALLOWED)).toBe(true);
    expect(originAllowed({ referer: 'https://evil.example/x' }, ALLOWED)).toBe(false);
  });
  it('does not treat missing browser headers as authentication', () => {
    expect(originAllowed({}, ALLOWED)).toBe(false);
  });
  it('does not allow an evil origin that merely prefixes an allowed one', () => {
    expect(originAllowed({ origin: 'http://localhost:5173.evil.example' }, ALLOWED)).toBe(false);
  });
});

describe('gateway startup configuration', () => {
  it('allows loopback without a shared secret', () => {
    expect(assertGatewayConfig('127.0.0.1', '')).toEqual({
      host: '127.0.0.1',
      remote: false,
    });
  });

  it('fails closed for a remote bind without a strong secret', () => {
    expect(() => assertGatewayConfig('0.0.0.0', '')).toThrow(/GATEWAY_SECRET/);
    expect(() => assertGatewayConfig('0.0.0.0', 'too-short')).toThrow(/32 characters/);
    expect(assertGatewayConfig('0.0.0.0', 'x'.repeat(32))).toEqual({
      host: '0.0.0.0',
      remote: true,
    });
  });
});

describe('single-use action confirmations', () => {
  it('binds the token to the exact action and arguments, then burns it', () => {
    const confirmations = createActionConfirmationStore(10_000);
    const token = confirmations.issue('calendar.addEvent', { text: 'ship it', channel: '#launch' });
    expect(
      confirmations.consume(token, 'calendar.addEvent', {
        channel: '#launch',
        text: 'changed',
      }),
    ).toBe(false);
    expect(
      confirmations.consume(token, 'calendar.addEvent', {
        channel: '#launch',
        text: 'ship it',
      }),
    ).toBe(false);
  });

  it('accepts reordered object keys exactly once and rejects expiry', () => {
    let t = 0;
    const confirmations = createActionConfirmationStore(100, () => t);
    const token = confirmations.issue('calendar.addEvent', { title: 'Review', start: '09:00' });
    expect(
      confirmations.consume(token, 'calendar.addEvent', { start: '09:00', title: 'Review' }),
    ).toBe(true);
    expect(
      confirmations.consume(token, 'calendar.addEvent', { start: '09:00', title: 'Review' }),
    ).toBe(false);

    const expired = confirmations.issue('calendar.addEvent', { title: 'Review' });
    t = 101;
    expect(confirmations.consume(expired, 'calendar.addEvent', { title: 'Review' })).toBe(false);
  });
});

describe('gateway secretOk (defense-in-depth)', () => {
  it('is open when no secret is configured', () => {
    expect(secretOk({}, '')).toBe(true);
  });
  it('requires a matching secret when configured', () => {
    expect(secretOk({ 'x-gateway-secret': 's3cret' }, 's3cret')).toBe(true);
    expect(secretOk({ 'x-gateway-secret': 'wrong' }, 's3cret')).toBe(false);
    expect(secretOk({}, 's3cret')).toBe(false);
  });
});

describe('OAuth state store (callback CSRF)', () => {
  it('accepts a freshly issued state exactly once', () => {
    const s = createOAuthStateStore(10_000);
    const state = s.issue();
    expect(s.consume(state)).toBe(true);
    expect(s.consume(state)).toBe(false); // single-use — a replay is rejected
  });
  it('rejects an unknown or empty state (a forged callback)', () => {
    const s = createOAuthStateStore(10_000);
    expect(s.consume('never-issued')).toBe(false);
    expect(s.consume('')).toBe(false);
    expect(s.consume(undefined)).toBe(false);
  });
  it('rejects an expired state', () => {
    let t = 1000;
    const s = createOAuthStateStore(5_000, () => t);
    const state = s.issue();
    t = 1000 + 5_001; // past the TTL
    expect(s.consume(state)).toBe(false);
  });
});
