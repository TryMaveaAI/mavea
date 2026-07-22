import { describe, it, expect } from 'vitest';
import { namespaceOf, namespaceLabel, groupedNodes } from '../src/live/memory/groups';
import type { MemoryNode } from '../src/live/memory/store';

const node = (concept: string, updatedAt = 0): MemoryNode => ({
  id: concept,
  concept,
  body: `Body for ${concept}.`,
  updatedAt,
});

describe('memory groups — concept namespace grouping', () => {
  it('extracts the top-level namespace from a concept path', () => {
    expect(namespaceOf(node('profile'))).toBe('profile');
    expect(namespaceOf(node('topics.finance'))).toBe('topics');
    expect(namespaceOf(node('threads.marathon'))).toBe('threads');
    expect(namespaceOf(node('preferences'))).toBe('preferences');
  });

  it('returns human-readable labels for known namespaces', () => {
    expect(namespaceLabel('profile')).toBe('About you');
    expect(namespaceLabel('preferences')).toBe('Preferences');
    expect(namespaceLabel('topics')).toBe('Topics');
    expect(namespaceLabel('threads')).toBe('Open threads');
    expect(namespaceLabel('projects')).toBe('Projects');
  });

  it('capitalises unknown namespaces as a fallback', () => {
    expect(namespaceLabel('sports')).toBe('Sports');
    expect(namespaceLabel('work')).toBe('Work');
  });

  it('puts profile first, then other namespaces alphabetically', () => {
    const out = groupedNodes([
      node('topics.finance'),
      node('preferences'),
      node('profile'),
      node('threads.marathon'),
    ]);
    expect(out.map((g) => g.namespace)).toEqual(['profile', 'preferences', 'threads', 'topics']);
  });

  it('sorts nodes within each namespace by most recently updated first', () => {
    const out = groupedNodes([
      node('topics.health', 1),
      node('topics.finance', 3),
      node('profile', 2),
    ]);
    const topics = out.find((g) => g.namespace === 'topics')!;
    expect(topics.nodes.map((n) => n.concept)).toEqual(['topics.finance', 'topics.health']);
  });

  it('omits namespaces with no nodes (no empty groups)', () => {
    const out = groupedNodes([node('profile')]);
    expect(out).toHaveLength(1);
    expect(out[0].namespace).toBe('profile');
  });
});
