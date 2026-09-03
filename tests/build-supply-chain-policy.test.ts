import { readFileSync, readdirSync } from 'node:fs';
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
    // `pnpm version` rewrites package.json and drops an empty "dependencies" key entirely rather
    // than keeping `{}` — the release workflow's version bump produces exactly that shape, so
    // treat absent and empty as the same "dependency-free" fact rather than one specific spelling.
    expect(pkg.dependencies ?? {}).toEqual({});
    const publishConfig = pkg.publishConfig as {
      access: string;
      engines: { node: string };
      provenance: boolean;
    };
    expect(publishConfig.access).toBe('public');
    expect(publishConfig.provenance).toBe(true);
    expect(publishConfig.engines.node).toBe('>=22.12');
    const files = pkg.files as string[];
    expect(files).toContain('!dist/ort-wasm-simd-threaded.wasm');
    expect(files).toContain('!dist/silero_vad_v5.onnx');
    expect(files).toContain('!dist/semantic');
  });

  it('checksum-verifies every voice asset fetched lazily by the published CLI', () => {
    const cli = read('bin/mavea.mjs');
    expect(cli).toContain('040d52ce5066707a10d45cb9500c35e70a9c2fb33c4fb63428da9ae45b956b97');
    expect(cli).toContain('2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f');
    expect(cli).toContain('bytes: 13_022_405');
    expect(cli).toContain('bytes: 2_327_524');
    expect(cli).toContain("createHash('sha256').update(bytes).digest('hex')");
    expect(cli).toContain('actualSha256 !== expectedSha256');
    expect(cli).toContain('received > expectedBytes');
  });

  it('serves `pnpm preview` through the CLI server, not the proxy-less `vite preview`', () => {
    // Raw `vite preview` has no /tts or /llm/* forwarders, so voice and Live silently break on
    // the production build — preview must stay on the same server `npx @mavea/mavea` runs.
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
    // Safari/iOS 16.4 and Firefox 114 are inside the Baseline target and have no native
    // modulepreload, so dropping the polyfill would cost them the parallel chunk fetch.
    expect(vite).toContain('modulePreload: { polyfill: true }');
    expect(vite).toContain('sourcemap: false');
    // Chunking is a stated policy, not whatever automatic splitting happens to produce: the
    // landing's eager graph ships as one file, not a dozen preloads before first paint.
    expect(vite).toContain("tags: ['$initial']");
  });

  it('ships the pdf.js image decoders everywhere a scanned page can be opened', () => {
    // A scanned PDF is one big JBIG2/JPEG 2000 image, decoded in WebAssembly that pdf.js fetches
    // from `wasmUrl` at run time. Miss any leg of this and the failure is silent and awful: pages
    // rasterize blank white while the claim highlights, which come from the text layer, still land
    // in exactly the right places. So pin the three legs together — the build copies the decoders,
    // the app asks for them at that path, and the artifact gate refuses to ship without them.
    const config = read('vite.config.ts');
    const decoders = ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm'];
    for (const decoder of decoders) expect(config).toContain(`'${decoder}'`);
    expect(config).toContain('src: `node_modules/pdfjs-dist/wasm/${file}`');
    // Redistributed binaries travel with their upstream notices.
    for (const notice of ['LICENSE_JBIG2', 'LICENSE_OPENJPEG', 'LICENSE_QCMS']) {
      expect(config).toContain(`'${notice}'`);
      expect(read('scripts/check-licenses.mjs')).toContain('pdfjs-dist');
    }
    expect(read('src/live/prism/extractPdf.ts')).toContain('`${import.meta.env.BASE_URL}pdfjs/`');
    const artifactGate = read('scripts/check-public-artifact.mjs');
    for (const decoder of decoders) expect(artifactGate).toContain(`pdfjs/${decoder}`);
  });

  it('keeps every top-level public/ entry on the reviewed inventory', () => {
    // Everything under public/ ships verbatim to every visitor, so a new entry is a provenance
    // decision, not a routine asset drop. Subset check only: public/semantic is generated and
    // absent on fresh checkouts.
    const reviewed = ['_headers', 'demo-assets', 'favicon.svg', 'fonts', 'semantic', 'sw.js'];
    const entries = readdirSync(resolve(root, 'public')).filter((entry) => !entry.startsWith('.'));
    for (const entry of entries) {
      expect(
        reviewed,
        `public/${entry}: new public/ assets need a provenance/license decision recorded in scripts/check-licenses.mjs NOTICE_NON_NPM`,
      ).toContain(entry);
    }
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

  it('keeps public CI on free standard runners and release publishing tokenless', () => {
    const workflows = readdirSync(resolve(root, '.github/workflows')).filter((path) =>
      /\.ya?ml$/.test(path),
    );
    for (const workflow of workflows) {
      const source = read(`.github/workflows/${workflow}`);
      for (const runner of source.matchAll(/runs-on:\s*([^\n]+)/g)) {
        expect(runner[1].trim(), `${workflow} must use a standard GitHub-hosted runner`).toBe(
          'ubuntu-latest',
        );
      }
      expect(source, `${workflow} must not upload billable artifacts`).not.toContain(
        'actions/upload-artifact',
      );
    }

    const release = read('.github/workflows/release.yml');
    expect(release).toContain('id-token: write');
    expect(release).toContain('run: npm publish --access public');
    expect(release).not.toContain('NODE_AUTH_TOKEN');
    expect(release).not.toContain('NPM_TOKEN');
  });
});
