import { describe, it, expect, vi } from 'vitest';
import {
  register,
  claim,
  isClaimed,
  subscribeClaim,
  __debugHasEntry,
  type StepController,
} from '../src/canvas/focus/stepDriver';

function makeController(count = 3): StepController {
  return {
    count,
    setIndex: vi.fn(),
    spokenFor: (i) => `spoken-${i}`,
    captionFor: (i) => `caption-${i}`,
  };
}

describe('stepDriver', () => {
  it('a registered-but-unclaimed block is claimable and reports unclaimed', () => {
    const id = 'blk-a';
    const unregister = register(id, makeController());
    expect(isClaimed(id)).toBe(false);
    unregister();
  });

  it('claim grants exclusive ownership; a second claim is refused until release', () => {
    const id = 'blk-b';
    const unregister = register(id, makeController());
    const first = claim(id);
    expect(first).not.toBeNull();
    expect(isClaimed(id)).toBe(true);
    // Someone else trying to claim the same id while it's held gets nothing.
    expect(claim(id)).toBeNull();
    first!.release();
    expect(isClaimed(id)).toBe(false);
    // Now a fresh claim succeeds.
    const second = claim(id);
    expect(second).not.toBeNull();
    second!.release();
    unregister();
  });

  it('claiming an unregistered id returns null', () => {
    expect(claim('never-registered')).toBeNull();
  });

  it('release is idempotent — calling it twice does not free a claim taken by someone else', () => {
    const id = 'blk-c';
    const unregister = register(id, makeController());
    const first = claim(id);
    first!.release();
    const second = claim(id);
    expect(second).not.toBeNull();
    // A stale release from the first claimant must not steal back second's live claim.
    first!.release();
    expect(isClaimed(id)).toBe(true);
    second!.release();
    unregister();
  });

  it('subscribeClaim notifies listeners on claim and release', () => {
    const id = 'blk-d';
    const unregister = register(id, makeController());
    const onChange = vi.fn();
    const unsubscribe = subscribeClaim(id, onChange);
    const held = claim(id);
    expect(onChange).toHaveBeenCalledTimes(1);
    held!.release();
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    unregister();
  });

  it('leak safety: register→unregister leaves no dangling entry', () => {
    const id = 'blk-leak-1';
    const unregister = register(id, makeController());
    expect(__debugHasEntry(id)).toBe(true);
    unregister();
    expect(__debugHasEntry(id)).toBe(false);
  });

  it('leak safety: claim→release after unregister leaves no dangling entry, and calling unregister twice is a no-op', () => {
    const id = 'blk-leak-2';
    const unregister = register(id, makeController());
    const held = claim(id);
    unregister();
    unregister(); // must not throw or double-clean a fresh registration under the same id
    expect(__debugHasEntry(id)).toBe(false);
    // The old claim's release, arriving after the block is long gone, must be inert.
    held!.release();
    expect(__debugHasEntry(id)).toBe(false);
  });

  it('leak safety: unregister force-releases a live claim so the driver never straddles a stale block', () => {
    const id = 'blk-leak-3';
    const unregister = register(id, makeController());
    const onChange = vi.fn();
    const unsubscribe = subscribeClaim(id, onChange);
    const held = claim(id);
    unregister();
    // The unregister itself must have flipped claimed → false, notifying the subscriber.
    expect(onChange).toHaveBeenCalled();
    expect(isClaimed(id)).toBe(false);
    // A NEW block registering under the same id (e.g. remount) starts unclaimed, not stuck.
    const secondUnregister = register(id, makeController());
    expect(isClaimed(id)).toBe(false);
    expect(claim(id)).not.toBeNull();
    unsubscribe();
    secondUnregister();
    // The old release token from before the remount must not reach into the new registration.
    held!.release();
  });

  it('leak safety: subscribeClaim before register still cleans up once both unsubscribe and unregister run', () => {
    const id = 'blk-leak-4';
    const onChange = vi.fn();
    const unsubscribe = subscribeClaim(id, onChange);
    expect(__debugHasEntry(id)).toBe(true); // a stub bucket exists so the claim can notify it
    const unregister = register(id, makeController());
    const held = claim(id);
    expect(onChange).toHaveBeenCalled();
    held!.release();
    unsubscribe();
    unregister();
    expect(__debugHasEntry(id)).toBe(false);
  });

  it('a controller that is registered but never claimed is left completely alone', () => {
    const id = 'blk-e';
    const controller = makeController();
    const unregister = register(id, controller);
    expect(isClaimed(id)).toBe(false);
    expect(controller.setIndex).not.toHaveBeenCalled();
    unregister();
  });
});
