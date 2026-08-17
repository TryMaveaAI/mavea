import { readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { credSafeConfig, credSafeConfigDir } from '../scripts/docker-cred-safe.mjs';

const DOCKER_CONFIG = join('/somewhere', '.docker');

describe('docker credential-safe config', () => {
  it('names no credential store, so a broken helper cannot block a public pull', () => {
    const config = credSafeConfig({});
    expect(config.auths).toEqual({});
    expect(config).not.toHaveProperty('credsStore');
    expect(config).not.toHaveProperty('credHelpers');
  });

  it('keeps compose reachable — the override must not cost us the command it is retrying', () => {
    // The regression this file exists for. Docker resolves CLI plugins out of whichever config dir
    // it is pointed at, and Docker Desktop installs `docker-compose` only under
    // <config>/cli-plugins — no system plugin dir carries it. So a config of nothing but empty
    // auths trades one failure for another: `unknown command: docker compose`, and the retry that
    // was supposed to rescue `pnpm dev` never runs at all.
    expect(credSafeConfig({ DOCKER_CONFIG }).cliPluginsExtraDirs).toEqual([
      join(DOCKER_CONFIG, 'cli-plugins'),
    ]);
  });

  it("falls back to Docker's own default config dir when DOCKER_CONFIG is unset", () => {
    expect(credSafeConfig({}).cliPluginsExtraDirs).toEqual([
      join(homedir(), '.docker', 'cli-plugins'),
    ]);
  });

  it('writes that config where `docker --config <dir>` will read it', () => {
    const dir = credSafeConfigDir({ DOCKER_CONFIG });
    try {
      expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toEqual(
        credSafeConfig({ DOCKER_CONFIG }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
