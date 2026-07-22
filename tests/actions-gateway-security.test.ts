// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
// @ts-expect-error — the gateway is a dependency-free ESM runtime module.
import * as actionsGateway from '../gateway/actions-gateway.mjs';

const { ACTIONS_HOST, createActionsGatewayServer, listenGateway } = actionsGateway;
const servers: Server[] = [];

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function request(
  port: number,
  path: string,
  {
    method = 'GET',
    headers = {},
    body = '',
  }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : {} });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function start(server: Server): Promise<number> {
  servers.push(server);
  const address = await listenGateway(server, {
    port: 0,
    host: '127.0.0.1',
  });
  if (!address || typeof address === 'string') throw new Error('expected TCP address');
  expect(address.address).toBe('127.0.0.1');
  return address.port;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(close));
});

describe('actions gateway security boundary', () => {
  it('defaults to loopback and survives a malformed request target', async () => {
    expect(ACTIONS_HOST).toBe('127.0.0.1');
    const port = await start(createActionsGatewayServer());

    expect((await request(port, '/%')).status).toBe(400);
    expect((await request(port, '/healthz')).status).toBe(200);
  });

  it('protects status, token-persisting OAuth poll, and every mutation', async () => {
    const port = await start(createActionsGatewayServer());

    expect((await request(port, '/oauth/status')).status).toBe(403);
    expect((await request(port, '/oauth/github/poll?device_code=forged')).status).toBe(403);
    expect(
      (
        await request(port, '/confirm', {
          method: 'POST',
          body: JSON.stringify({ id: 'calendar.addEvent', args: { text: 'hi' } }),
        })
      ).status,
    ).toBe(403);

    const allowed = await request(port, '/oauth/status', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.status).toBe(200);
  });

  it('binds confirmations to exact args and burns a mismatched token', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const port = await start(createActionsGatewayServer());
    const headers = {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    };
    const args = { channel: '#launch', text: 'ship it' };
    const confirmation = await request(port, '/confirm', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'calendar.addEvent', args }),
    });
    expect(confirmation.status).toBe(200);
    const token = String(confirmation.body.confirmationToken);

    const altered = await request(port, '/calendar.addEvent', {
      method: 'POST',
      headers: { ...headers, 'X-Action-Confirmation': token },
      body: JSON.stringify({ args: { ...args, text: 'changed after confirmation' } }),
    });
    expect(altered.status).toBe(403);

    const replay = await request(port, '/calendar.addEvent', {
      method: 'POST',
      headers: { ...headers, 'X-Action-Confirmation': token },
      body: JSON.stringify({ args }),
    });
    expect(replay.status).toBe(403);
  });

  it('returns 413 for an oversized privileged body without killing the socket', async () => {
    const port = await start(createActionsGatewayServer());
    const response = await request(port, '/confirm', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'calendar.addEvent', args: { text: 'x'.repeat(70_000) } }),
    });

    expect(response.status).toBe(413);
    expect((await request(port, '/healthz')).status).toBe(200);
  });
});
