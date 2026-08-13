import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CommandComposer } from '../src/components/CommandComposer';

describe('CommandComposer mic modes', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLButtonElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function mount(mode: 'tap' | 'hold' | 'always', listening = false) {
    const onMic = vi.fn();
    const onMicDown = vi.fn();
    const onForceStop = vi.fn();
    const onMicCancel = vi.fn();
    const view = render(
      <CommandComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        listening={listening}
        onMic={onMic}
        micMode={mode}
        onMicDown={onMicDown}
        onForceStop={onForceStop}
        onMicCancel={onMicCancel}
      />,
    );
    return { ...view, onMic, onMicDown, onForceStop, onMicCancel };
  }

  it('keeps Tap as one predictable click with no hidden hold gesture', () => {
    const { getByRole, onMic, onMicDown, onForceStop } = mount('tap');
    const mic = getByRole('button', { name: 'Talk to Mavéa' });

    fireEvent.pointerDown(mic, { pointerId: 1 });
    fireEvent.pointerUp(mic, { pointerId: 1 });
    fireEvent.click(mic);

    expect(onMic).toHaveBeenCalledTimes(1);
    expect(onMicDown).not.toHaveBeenCalled();
    expect(onForceStop).not.toHaveBeenCalled();
  });

  it('starts Hold immediately on press and sends on release without a click toggle', () => {
    const { getByRole, onMic, onMicDown, onForceStop } = mount('hold');
    const mic = getByRole('button', { name: 'Hold to talk' });

    fireEvent.pointerDown(mic, { pointerId: 7 });
    expect(onMicDown).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(mic, { pointerId: 7 });
    fireEvent.click(mic);

    expect(onForceStop).toHaveBeenCalledTimes(1);
    expect(onMic).not.toHaveBeenCalled();
  });

  it('cancels a lost Hold gesture instead of submitting partial speech', () => {
    const { getByRole, onForceStop, onMicCancel } = mount('hold');
    const mic = getByRole('button', { name: 'Hold to talk' });

    fireEvent.pointerDown(mic, { pointerId: 4 });
    fireEvent.pointerCancel(mic, { pointerId: 4 });

    expect(onMicCancel).toHaveBeenCalledTimes(1);
    expect(onForceStop).not.toHaveBeenCalled();
  });

  it('labels an active capture as the explicit completion action', () => {
    const { getByRole } = mount('always', true);
    expect(getByRole('button', { name: 'Finish and send' })).toBeTruthy();
  });

  it('does not start an overlapping Tap capture while local transcription is finishing', () => {
    const onMic = vi.fn();
    const { getByRole } = render(
      <CommandComposer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        listening={false}
        onMic={onMic}
        micMode="tap"
        micProcessing
      />,
    );

    const mic = getByRole('button', { name: 'Finishing voice input' });
    fireEvent.click(mic);
    expect(onMic).not.toHaveBeenCalled();
    // …and it says so: busy, with the styling hook that mutes it. Never `disabled` — always-on
    // deliberately still takes the tap, and disabling would drop it out of focus order.
    expect(mic).toHaveAttribute('aria-busy', 'true');
    expect(mic).toHaveClass('processing');
    expect(mic).not.toBeDisabled();
  });

  // The class carried no rule for a while, so the button looked idle while ignoring taps — a
  // touch user saw nothing at all (only the hover tooltip changed).
  it('the busy state is actually styled, not just class-named', () => {
    const css = readFileSync(join(__dirname, '..', 'src/styles/composer.css'), 'utf8');
    expect(css).toMatch(/\.mic-btn\.processing\s*\{[^}]+\}/);
  });
});
