import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { UnitConvert } from '../src/canvas/blocks/everyday/UnitConvert';
import type { UnitEquivalent } from '../src/canvas/blocks/everyday/types';

// Regression coverage for a real bug: equivalent rows are a flex row (.uc-row) with no width
// constraint on the unit name, so a realistic unit name (well past the short demo fixtures like
// "ml"/"tbsp" — real units run "fluid ounces", "kilometers per hour") overflowed past the card
// edge instead of truncating.

describe('UnitConvert', () => {
  it('sizes long unit names to truncate within the row instead of overflowing', () => {
    const equivalents: UnitEquivalent[] = [
      { unit: 'milliliters', value: '240' },
      { unit: 'imperial fluid ounces', value: '8.45' },
      { unit: 'US tablespoons', value: '16' },
      { unit: 'metric teaspoons', value: '48' },
    ];
    const { container } = render(
      <UnitConvert title="Convert" quantity={1} from="cup" equivalents={equivalents} />,
    );

    const units = Array.from(container.querySelectorAll<HTMLElement>('.uc-unit'));
    expect(units).toHaveLength(equivalents.length);

    for (const [i, el] of units.entries()) {
      // The row must be able to shrink the unit span instead of forcing it to its content
      // width — a fixed/auto width is exactly what let long names push past the card.
      expect(el.style.minWidth).toBe('0px');
      expect(el.style.flex).toBe('1 1 0%');
      // Overflow is clipped with an ellipsis rather than wrapping or spilling out.
      expect(el.style.overflow).toBe('hidden');
      expect(el.style.textOverflow).toBe('ellipsis');
      expect(el.style.whiteSpace).toBe('nowrap');
      // The untruncated name is still available, via a native title tooltip.
      expect(el.getAttribute('title')).toBe(equivalents[i].unit);
      expect(el.textContent).toBe(equivalents[i].unit);
    }
  });

  it('leaves short demo-length unit names rendering exactly as given', () => {
    const equivalents: UnitEquivalent[] = [
      { unit: 'ml', value: '240' },
      { unit: 'tbsp', value: '16' },
    ];
    const { container } = render(
      <UnitConvert title="Convert" quantity={1} from="cup" equivalents={equivalents} />,
    );
    const units = Array.from(container.querySelectorAll('.uc-unit'));
    expect(units.map((u) => u.textContent)).toEqual(['ml', 'tbsp']);
  });
});
