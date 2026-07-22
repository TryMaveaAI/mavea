import { describe, it, expect } from 'vitest';
import { safeCssColor } from '../src/lib/safeCssColor';

describe('safeCssColor', () => {
  it('accepts plain color literals verbatim', () => {
    for (const c of [
      '#fff',
      '#ffffff',
      '#ffffffff',
      '#1a2b3c',
      'rgb(10, 20, 30)',
      'rgba(10,20,30,0.5)',
      'hsl(210, 50%, 40%)',
      'hsla(210 50% 40% / 0.5)',
      'red',
      'TEAL',
      'transparent',
      'var(--presence)',
      'var(--accent, #fff)',
    ]) {
      expect(safeCssColor(c)).toBe(c);
    }
  });

  it('rejects a CSS url() smuggled through a gradient stop', () => {
    // The whole point: this must not reach an inline style intact.
    const attack = 'red), url("https://image.pollinations.ai/prompt/secret")';
    expect(safeCssColor(attack)).toBe('var(--presence)');
  });

  it('rejects extra declarations, functions, and quotes', () => {
    for (const bad of [
      'red; background: url(https://evil/x)',
      'url(https://evil/x)',
      'expression(alert(1))',
      "'; --x: url(evil)",
      'var(--x); background: url(evil)',
      'rgb(0,0,0) url(evil)',
      '#fff)',
    ]) {
      expect(safeCssColor(bad)).toBe('var(--presence)');
    }
  });

  it('honors a caller-supplied fallback and handles empty/oversized input', () => {
    expect(safeCssColor(undefined, 'var(--x)')).toBe('var(--x)');
    expect(safeCssColor('', 'var(--x)')).toBe('var(--x)');
    expect(safeCssColor('  ', 'var(--x)')).toBe('var(--x)');
    expect(safeCssColor('#'.padEnd(80, 'a'), 'var(--x)')).toBe('var(--x)');
  });
});
