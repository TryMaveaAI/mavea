// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
// @ts-expect-error — the published CLI is intentionally a dependency-free ESM module.
import { appPolicyFor } from '../bin/mavea.mjs';
import { POLICY_NAMES } from '../src/lib/trustedTypes';

// The Content-Security-Policy is written once, in index.html's <meta> tag, and delivered three
// ways: the tag itself (any static host), public/_headers (Cloudflare Pages / Netlify) and the
// `npx mavea` server. A policy that differs between them is a policy nobody reviewed, so every
// copy is held to the tag here.
const ROOT = join(__dirname, '..');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const metaPolicy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(indexHtml)?.[1];
const headerPolicy = `${metaPolicy}; frame-ancestors 'none'`;

function directive(name: string): string[] {
  const found = metaPolicy
    ?.split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  if (!found) throw new Error(`no ${name} directive in the CSP`);
  return found.slice(1);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe('one Content-Security-Policy, delivered three ways', () => {
  it('is defined in the page itself', () => {
    expect(metaPolicy).toBeTruthy();
  });

  it('public/_headers sends exactly the meta policy plus frame-ancestors', () => {
    const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8');
    const appBlock = headers.split(/^\/\*$/m)[1]?.split(/^\//m)[0] ?? '';
    const line = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(appBlock)?.[1].trim();
    expect(line).toBe(headerPolicy);
  });

  it('the npx mavea server reads the same policy back out of the page it serves', () => {
    expect(appPolicyFor(ROOT)).toBe(headerPolicy);
  });
});

describe('Trusted Types', () => {
  it('names exactly the policies the app creates, and requires them for every script sink', () => {
    expect(directive('trusted-types')).toEqual([...POLICY_NAMES]);
    expect(directive('require-trusted-types-for')).toEqual(["'script'"]);
  });

  // `SanitizedHtml` is what lets a string reach the `mavea` policy, so the brand may only be
  // applied where a sanitizer (or reviewed static markup) produces the string.
  it('lets only the sanitizers brand a string as sanitized', () => {
    const branding = sourceFiles(join(ROOT, 'src'))
      .filter((file) => /as SanitizedHtml\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file))
      .sort();
    expect(branding).toEqual([
      'src/canvas/blocks/display/shikiHighlight.ts',
      'src/canvas/blocks/learn/TeX.tsx',
      'src/canvas/blocks/media/sanitizeSvg.ts',
      'src/lib/richText.ts',
      'src/lib/trustedTypes.ts',
    ]);
  });
});

describe('style-src admits no inline stylesheet it has not hashed', () => {
  const styleSrc = directive('style-src');
  const hash = (css: string) => `'sha256-${createHash('sha256').update(css).digest('base64')}'`;

  it('carries no unsafe-inline for <style> elements', () => {
    expect(styleSrc).not.toContain("'unsafe-inline'");
    expect(directive('style-src-attr')).toEqual(["'unsafe-inline'"]);
  });

  it('hashes every <style> the page ships, so editing one names its new hash here', () => {
    const markup = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
    const blocks = [...markup.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    for (const css of blocks) expect(styleSrc).toContain(hash(css));
  });

  it('admits the empty <style> the raster export fills through the CSSOM', () => {
    expect(styleSrc).toContain(hash(''));
  });

  it('keeps inline <style> elements out of the app, where the policy would refuse them', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .some((line) => !/^\s*(\/\/|\*|\{\/\*)/.test(line) && /<style[\s>]/.test(line)),
      )
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
