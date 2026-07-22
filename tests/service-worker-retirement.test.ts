import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const worker = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
const entry = readFileSync(join(__dirname, '../src/main.tsx'), 'utf8');

describe('legacy service-worker retirement', () => {
  it('deletes only Mavéa caches and unregisters itself without intercepting requests', () => {
    expect(worker).toContain("const MAVEA_CACHE_PREFIX = 'mavea-static-'");
    expect(worker).toContain('self.registration.unregister()');
    expect(worker).toContain("self.addEventListener('activate'");
    expect(worker).not.toContain("self.addEventListener('fetch'");
    expect(worker).not.toContain('cache.put(');
  });

  it('does not register a new worker and cleans up only the historical /sw.js registration', () => {
    expect(entry).toContain('.getRegistrations()');
    expect(entry).toContain("new URL(worker.scriptURL).pathname !== '/sw.js'");
    expect(entry).toContain("key.startsWith('mavea-static-')");
    expect(entry).not.toContain("serviceWorker.register('/sw.js')");
  });
});
