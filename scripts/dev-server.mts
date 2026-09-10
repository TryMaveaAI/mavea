// dev-server.mts — start Vite for an audit that was not handed a `--url`, and wait until it can
// actually serve a module. One command, never a split stack: an audit that assumes a server is
// already running fails silently in exactly the way the working agreement forbids.
//
// index.html is served as a static file BEFORE dep optimisation finishes, so a probe on `/` proves
// only that the port is open. A module request blocks until the optimiser is ready — pay that here
// rather than inside a 30s Playwright navigation.
import { spawn, type ChildProcess } from 'node:child_process';

export interface DevServer {
  url: string;
  stop: () => void;
}

const DEFAULT_PORT = 5178;

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startDevServer(port = DEFAULT_PORT): Promise<DevServer> {
  const url = `http://127.0.0.1:${port}`;
  // strictPort: without it an occupied port silently binds the next one, and every readiness
  // probe below then passes against a server whose log looks perfectly healthy.
  const child: ChildProcess = spawn(
    'pnpm',
    ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const stop = () => {
    if (!child.killed) child.kill();
  };
  process.on('exit', stop);

  const started = Date.now();
  while (!(await reachable(`${url}/`))) {
    if (child.exitCode !== null) throw new Error(`vite exited before serving:\n${log}`);
    if (Date.now() - started > 60_000) {
      stop();
      throw new Error(`vite did not open ${url} within 60s:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await reachable(`${url}/src/main.tsx`))) {
    // The optimiser can take minutes on a cold cache; one long request is cheaper than guessing.
    const res = await fetch(`${url}/src/main.tsx`, { signal: AbortSignal.timeout(600_000) }).catch(
      () => null,
    );
    if (!res?.ok) {
      stop();
      throw new Error(`vite never served /src/main.tsx:\n${log}`);
    }
  }
  return { url, stop };
}
