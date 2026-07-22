import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json')) as Record<string, unknown>;

describe('production build and package-manager policy', () => {
  it('pins the current package-manager line and every direct dependency exactly', () => {
    expect(pkg.packageManager).toMatch(/^pnpm@11\.\d+\.\d+$/);
    const dependencyGroups = ['dependencies', 'devDependencies'] as const;
    for (const group of dependencyGroups) {
      const entries = (pkg[group] ?? {}) as Record<string, string>;
      for (const [name, version] of Object.entries(entries)) {
        expect(version, `${group}.${name} must be exact`).toMatch(
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
        );
      }
    }
  });

  it('checks generated prompt references before release verification', () => {
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.verify).toContain('pnpm check:reference-examples');
    expect(scripts.verify).toContain('pnpm check:gallery-fixtures');
    expect(scripts['check:reference-examples']).toBe(
      'node --import tsx scripts/generate-reference-examples.mts',
    );
    expect(scripts['check:gallery-fixtures']).toBe(
      'node --import tsx scripts/generate-gallery-fixtures.mjs',
    );
  });

  it('keeps the published CLI dependency-free and excludes lazy voice models', () => {
    expect(pkg.dependencies).toEqual({});
    expect((pkg.publishConfig as { engines: { node: string } }).engines.node).toBe('>=20.19');
    const files = pkg.files as string[];
    expect(files).toContain('!dist/ort-wasm-simd-threaded.wasm');
    expect(files).toContain('!dist/silero_vad_v5.onnx');
  });

  it('serves `pnpm preview` through the CLI server, not the proxy-less `vite preview`', () => {
    // Raw `vite preview` has no /tts or /llm/* forwarders, so voice and Live silently break on
    // the production build — preview must stay on the same server `npx mavea` runs.
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.preview).toBe('node bin/mavea.mjs');
  });

  it('fails closed on new packages, peers, engines, and dependency install scripts', () => {
    const workspace = read('pnpm-workspace.yaml');
    expect(workspace).toMatch(/minimumReleaseAge:\s*1440/);
    expect(workspace).toMatch(/blockExoticSubdeps:\s*true/);
    expect(workspace).toMatch(/strictPeerDependencies:\s*true/);
    expect(workspace).toMatch(/engineStrict:\s*true/);
    expect(workspace).toMatch(/allowBuilds:[\s\S]*esbuild:\s*true/);
    expect(workspace).toMatch(/core-js:\s*false/);
    expect(workspace).toMatch(/protobufjs:\s*false/);
  });

  it('makes production minification and compatibility targets explicit', () => {
    const vite = read('vite.config.ts');
    expect(vite).toContain("target: 'baseline-widely-available'");
    expect(vite).toContain("minify: 'oxc'");
    expect(vite).toContain("cssMinify: 'lightningcss'");
    expect(vite).toContain('cssCodeSplit: true');
    expect(vite).toContain('modulePreload: { polyfill: true }');
    expect(vite).toContain('sourcemap: false');
  });

  it('uses frozen, cache-aware installs in every dependency-installing CI job', () => {
    for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
      const installs = [...read(workflow).matchAll(/pnpm install[^\n]*/g)].map((match) => match[0]);
      expect(installs.length, `${workflow} must install dependencies`).toBeGreaterThan(0);
      for (const install of installs) {
        expect(install).toContain('--frozen-lockfile');
        expect(install).toContain('--prefer-offline');
      }
    }
  });
});
