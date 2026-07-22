import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { TOPIC_LIST } from '../src/data/topics';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// Mount then unmount every authored block under fake timers and assert that no
// setTimeout/setInterval survives the unmount. An uncleaned timer does not throw — it fires
// later on a dead component — so the "unmounts without throwing" smoke check can't catch it;
// this can. It's the automated guard behind the useTimeout/useInterval hooks: a timer driven
// by those is always cleared on unmount, so this stays at zero across the whole library.

function specForBlock(block: Block): ConversationSpec {
  return {
    id: 'money', // any valid TopicId; the canvas never reads it
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [],
    blocks: [block],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

const ALL_BLOCKS: { label: string; block: Block }[] = TOPIC_LIST.flatMap((t) =>
  t.blocks.map((block, i) => ({ label: `${t.id}#${i} (${block.type})`, block })),
);

describe('timer leaks', () => {
  afterEach(() => vi.useRealTimers());

  it('no authored block leaves a timer pending after unmount', () => {
    expect(ALL_BLOCKS.length).toBeGreaterThan(200); // guard against a silently-empty corpus

    const leakers: string[] = [];
    for (const { label, block } of ALL_BLOCKS) {
      // Fake only the timer APIs (not Date/raf) so the count reflects exactly the leak class.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const { unmount } = render(
        <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
      );
      unmount();
      if (vi.getTimerCount() > 0) leakers.push(label);
      vi.useRealTimers();
    }

    expect(
      leakers,
      `these blocks left a timer pending after unmount: ${leakers.join(', ')}`,
    ).toEqual([]);
  }, 60_000); // mounts/unmounts 200+ blocks; the global 20s budget flakes under heavy load
});

// A timer is one leak class; a dangling event listener or undisposed resource is another, and
// just as silent. This pass mounts/unmounts every block and asserts each one removes any
// window/document listener it added, revokes any object URL it created, and disconnects any
// observer/AudioContext it opened. Listeners are the class jsdom can observe directly; the
// resource counters degrade safely where an API is absent (jsdom has no AudioContext), and
// tighten automatically in a richer environment — so the guard can only get stronger.
describe('listener & resource leaks', () => {
  // Stable identity per listener so we can match an add to its later remove.
  let nextId = 0;
  const ids = new WeakMap<object, number>();
  const keyFor = (target: string, type: string, fn: unknown): string | null => {
    if (typeof fn !== 'object' && typeof fn !== 'function') return null;
    let id = ids.get(fn as object);
    if (id === undefined) ids.set(fn as object, (id = ++nextId));
    return `${target} ${type} ${id}`;
  };
  const active = new Map<string, number>();

  function patch(target: EventTarget, name: string) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (
      type: string,
      fn: EventListenerOrEventListenerObject | null,
      opts?: unknown,
    ) => {
      const k = keyFor(name, type, fn);
      if (k) active.set(k, (active.get(k) ?? 0) + 1);
      return add(type, fn, opts as never);
    };
    target.removeEventListener = (
      type: string,
      fn: EventListenerOrEventListenerObject | null,
      opts?: unknown,
    ) => {
      const k = keyFor(name, type, fn);
      if (k) {
        const n = (active.get(k) ?? 0) - 1;
        if (n > 0) active.set(k, n);
        else active.delete(k);
      }
      return remove(type, fn, opts as never);
    };
  }
  // Object-URL ledger: every createObjectURL must be matched by a revokeObjectURL.
  const liveUrls = new Set<string>();

  it('no authored block leaves a listener, object URL, or observer alive after unmount', () => {
    patch(window, 'window');
    patch(document, 'document');

    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const u = realCreate ? realCreate(obj) : `blob:mock/${++nextId}`;
      liveUrls.add(u);
      return u;
    };
    URL.revokeObjectURL = (u: string) => {
      liveUrls.delete(u);
      realRevoke?.(u);
    };

    const leakers: string[] = [];
    for (const { label, block } of ALL_BLOCKS) {
      const beforeListeners = new Set(active.keys());
      const beforeUrls = liveUrls.size;

      const { unmount } = render(
        <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
      );
      unmount();

      const leakedListener = [...active.keys()].some((k) => !beforeListeners.has(k));
      const leakedUrl = liveUrls.size > beforeUrls;
      if (leakedListener || leakedUrl) leakers.push(label);
    }

    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;

    expect(
      leakers,
      `these blocks leaked a listener or object URL after unmount: ${leakers.join(', ')}`,
    ).toEqual([]);
  }, 60_000); // mounts/unmounts 200+ blocks; the global 20s budget flakes under heavy load
});

// A timer is one leak class, a listener/object-URL is another — an outstanding
// requestAnimationFrame is a third, and nothing above catches it: fake timers never touch raf,
// and jsdom happily keeps ticking a callback scheduled by a component that no longer exists. A
// block that starts its own raf loop (rather than going through the motion.ts hooks, which
// always cancel on unmount) leaves it running against a detached tree — wasted CPU at best, a
// throw-on-stale-ref crash at worst. Same patch-and-diff technique as the listener pass above,
// applied to requestAnimationFrame/cancelAnimationFrame instead.
describe('animation-frame leaks', () => {
  it('no authored block leaves a requestAnimationFrame pending after unmount', () => {
    const outstanding = new Set<number>();
    const realRaf = window.requestAnimationFrame.bind(window);
    const realCancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = realRaf(cb);
      outstanding.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number) => {
      outstanding.delete(id);
      realCancel(id);
    };

    const leakers: string[] = [];
    for (const { label, block } of ALL_BLOCKS) {
      outstanding.clear();
      const { unmount } = render(
        <TopicCanvas data={specForBlock(block)} spot={null} built={{}} onProve={() => {}} />,
      );
      unmount();
      if (outstanding.size > 0) leakers.push(label);
    }

    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;

    expect(
      leakers,
      `these blocks left a requestAnimationFrame pending after unmount: ${leakers.join(', ')}`,
    ).toEqual([]);
  }, 60_000); // mounts/unmounts 200+ blocks; the global 20s budget flakes under heavy load
});
