// Worker results must stay on the dedicated Worker event channel. The sandbox must never add a
// window-level postMessage listener that another frame could spoof.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInSandbox } from '../src/canvas/blocks/code/sandbox';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sandbox result channel isolation', () => {
  it('accepts results only from the worker instance', async () => {
    class ResultWorker {
      static latest: ResultWorker;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        ResultWorker.latest = this;
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', ResultWorker);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:result-worker'),
      revokeObjectURL: vi.fn(),
    });
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const pending = runInSandbox('console.log(1 + 1)', 'js');
    ResultWorker.latest.onmessage?.(
      new MessageEvent('message', { data: { ok: true, output: 'done' } }),
    );

    expect(await pending).toMatchObject({ ok: true, output: 'done' });
    expect(addWindowListener).not.toHaveBeenCalledWith('message', expect.anything());
    const source = readFileSync(join(process.cwd(), 'src/canvas/blocks/code/sandbox.ts'), 'utf8');
    expect(source).not.toContain("window.addEventListener('message'");
    expect(source).not.toContain('window.parent.postMessage');
  });
});
