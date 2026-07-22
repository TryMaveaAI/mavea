import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BohrModel } from '../src/canvas/blocks/learn/BohrModel';

// Regression coverage for a real bug: the electron-configuration summary along the bottom of
// the right-hand gutter ("2·8·18·32·... = N e⁻") rendered as a single unconstrained <text> node,
// so a heavy atom with many shells / high per-shell counts ran wider than the gutter and clipped
// past the card's left edge. The demo fixtures (sodium, argon) never had enough shells to expose
// this — a uranium-sized configuration does.

const GUTTER_LEFT = 360 - 96 + 6; // W - GUTTER + 6, mirrors BohrModel's internal leader-line x

describe('BohrModel', () => {
  it('wraps a long electron-configuration summary instead of overflowing the gutter', () => {
    // Uranium: 7 shells, well beyond the small demo fixtures — the joined count string alone
    // ("2·8·18·32·32·8·2") is longer than the gutter can hold on one line.
    const { container } = render(
      <BohrModel title="Uranium" protons={92} neutrons={146} shells={[2, 8, 18, 32, 32, 8, 2]} />,
    );
    const config = container.querySelector('text.boh-config');
    expect(config).toBeTruthy();
    const lines = Array.from(config!.querySelectorAll('tspan'));
    // Wrapped across more than one line — a single unconstrained line is exactly the bug.
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      // Every wrapped line stays right-anchored at the same x as the shell-occupancy labels,
      // so it never drifts outside the gutter column horizontally.
      expect(Number(line.getAttribute('x'))).toBe(350);
      // No single line's estimated width should be wider than the gutter itself — the whole
      // point of wrapping is that no rendered line runs past the leader-line column.
      const text = line.textContent ?? '';
      const estWidth = text.length * (9.5 * 0.62);
      expect(estWidth).toBeLessThanOrEqual(350 - GUTTER_LEFT + 1);
    }
    // The full configuration is preserved verbatim across the wrapped lines — wrapping must
    // never silently drop electrons the way a truncation with an ellipsis would.
    const joined = lines.map((l) => l.textContent).join('');
    expect(joined).toContain('2·8·18·32·32·8·2');
    expect(joined).toContain('102 e⁻');
  });

  it('renders a short configuration on a single line, unchanged', () => {
    const { container } = render(
      <BohrModel title="Sodium" protons={11} neutrons={12} shells={[2, 8, 1]} />,
    );
    const config = container.querySelector('text.boh-config');
    expect(config).toBeTruthy();
    const lines = Array.from(config!.querySelectorAll('tspan'));
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('2·8·1 = 11 e⁻');
  });
});
