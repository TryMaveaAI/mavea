// The family rail says where its row continues: an arrow and a fade appear only on the edge that
// has more, and a press moves the row by most of a screenful.
import { render, fireEvent, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FamilyRail } from '../src/gallery/FamilyRail';

/** jsdom lays nothing out, so the row's geometry is what the test says it is. */
function sizeRow(list: HTMLElement, scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  Object.defineProperty(list, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(list, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(list, 'scrollLeft', {
    configurable: true,
    value: scrollLeft,
    writable: true,
  });
}

function mount(scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  const scrolled: ScrollToOptions[] = [];
  const realScrollBy = HTMLElement.prototype.scrollBy;
  HTMLElement.prototype.scrollBy = function (this: HTMLElement, opts?: ScrollToOptions | number) {
    if (typeof opts === 'object') scrolled.push(opts);
  } as typeof realScrollBy;
  const rendered = render(
    <FamilyRail label="Filter by family">
      <button type="button" role="radio" aria-checked="true">
        All
      </button>
      <button type="button" role="radio" aria-checked="false">
        Charts
      </button>
    </FamilyRail>,
  );
  const list = rendered.getByRole('radiogroup', { name: 'Filter by family' });
  sizeRow(list, scrollWidth, clientWidth, scrollLeft);
  act(() => {
    fireEvent.scroll(list);
  });
  return {
    ...rendered,
    list,
    scrolled,
    rail: list.parentElement as HTMLElement,
    restore: () => {
      HTMLElement.prototype.scrollBy = realScrollBy;
    },
  };
}

describe('FamilyRail', () => {
  it('shows no arrow and no fade when every chip fits', () => {
    const t = mount(600, 600);
    try {
      expect(t.queryByRole('button', { name: /Show/ })).toBeNull();
      expect(t.rail.dataset.edge).toBeUndefined();
    } finally {
      t.restore();
    }
  });

  it('marks the trailing edge when the row continues to the right', () => {
    const t = mount(1600, 600);
    try {
      expect(t.rail.dataset.edge).toBe('end');
      expect(t.getByRole('button', { name: 'Show more families' })).toBeInTheDocument();
      expect(t.queryByRole('button', { name: 'Show earlier families' })).toBeNull();
    } finally {
      t.restore();
    }
  });

  it('marks both edges mid-row and moves the row by most of a screenful per press', () => {
    const t = mount(1600, 600, 500);
    try {
      expect(t.rail.dataset.edge).toBe('both');
      fireEvent.click(t.getByRole('button', { name: 'Show more families' }));
      fireEvent.click(t.getByRole('button', { name: 'Show earlier families' }));
      expect(t.scrolled.map((o) => o.left)).toEqual([480, -480]);
      expect(t.scrolled.every((o) => o.behavior === 'smooth')).toBe(true);
    } finally {
      t.restore();
    }
  });

  it('marks only the leading edge once the row is scrolled to its end', () => {
    const t = mount(1600, 600, 1000);
    try {
      expect(t.rail.dataset.edge).toBe('start');
      expect(t.queryByRole('button', { name: 'Show more families' })).toBeNull();
    } finally {
      t.restore();
    }
  });
});
