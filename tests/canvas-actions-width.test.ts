import { describe, expect, it } from 'vitest';
import { measureActionsWidth } from '../src/canvas/layout/measureActionsWidth';

// The action cluster (Ask/Watch/Add/Drag) must never overlap a block's own top-right
// controls. measureActionsWidth publishes the cluster's REAL width as --block-actions-w on
// the card cell so the reserved corridor always matches the buttons actually present — the
// fix for the hardcoded 116px that broke whenever a button was added. These tests lock that
// the published value tracks the measured width and that it degrades safely.

function makeCluster(width: number): { cell: HTMLElement; cluster: HTMLDivElement } {
  const cell = document.createElement('div');
  const cluster = document.createElement('div');
  cell.appendChild(cluster);
  cluster.getBoundingClientRect = () =>
    ({
      width,
      height: 24,
      top: 0,
      left: 0,
      right: width,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  return { cell, cluster };
}

describe('measureActionsWidth', () => {
  it('publishes the measured width (+gap) as --block-actions-w on the card cell', () => {
    const { cell, cluster } = makeCluster(60);
    measureActionsWidth(cluster);
    // 60 measured + 18 (right inset + gap) so content clears the cluster exactly.
    expect(cell.style.getPropertyValue('--block-actions-w')).toBe('78px');
  });

  it('adapts when the cluster is wider (e.g. an extra button)', () => {
    const { cell, cluster } = makeCluster(96);
    measureActionsWidth(cluster);
    expect(cell.style.getPropertyValue('--block-actions-w')).toBe('114px');
  });

  it('does not publish a corridor from a 0 read (not yet laid out) — keeps the CSS default', () => {
    const { cell, cluster } = makeCluster(0);
    measureActionsWidth(cluster);
    expect(cell.style.getPropertyValue('--block-actions-w')).toBe('');
  });

  it('returns a disposer and no-ops without a parent', () => {
    expect(measureActionsWidth(null)).toBeUndefined();
    const orphan = document.createElement('div');
    expect(measureActionsWidth(orphan)).toBeUndefined();
  });
});
