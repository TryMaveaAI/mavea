// ripple-github-url.test.ts — the smart GitHub input. Paste a PR/compare/tree/repo URL or a shorthand
// and it routes to the right read-only connector. Guards every recognized shape + honest invalids.
import { describe, it, expect } from 'vitest';
import { parseGitHubInput } from '../src/live/ripple/ingest/parseGitHubUrl';

describe('parseGitHubInput — URLs', () => {
  it('a pull-request URL (and /files, protocol, www)', () => {
    expect(parseGitHubInput('https://github.com/acme/auth/pull/482')).toEqual({
      kind: 'pr',
      repo: 'acme/auth',
      prNumber: '482',
    });
    expect(parseGitHubInput('https://www.github.com/acme/auth/pull/482/files')).toEqual({
      kind: 'pr',
      repo: 'acme/auth',
      prNumber: '482',
    });
    expect(parseGitHubInput('github.com/acme/auth/pull/482#discussion_r1')).toEqual({
      kind: 'pr',
      repo: 'acme/auth',
      prNumber: '482',
    });
  });

  it('a compare URL (... and ..)', () => {
    expect(parseGitHubInput('github.com/acme/auth/compare/main...feat/short-lived')).toEqual({
      kind: 'compare',
      repo: 'acme/auth',
      base: 'main',
      head: 'feat/short-lived',
    });
    expect(parseGitHubInput('github.com/acme/auth/compare/v1..v2')).toEqual({
      kind: 'compare',
      repo: 'acme/auth',
      base: 'v1',
      head: 'v2',
    });
  });

  it('a tree URL → folder explore; a blob URL → its parent folder', () => {
    expect(parseGitHubInput('github.com/acme/auth/tree/main/src/auth')).toEqual({
      kind: 'tree',
      repo: 'acme/auth',
      ref: 'main',
      path: 'src/auth',
    });
    expect(parseGitHubInput('github.com/acme/auth/blob/main/src/auth/token.ts')).toEqual({
      kind: 'tree',
      repo: 'acme/auth',
      ref: 'main',
      path: 'src/auth',
    });
  });

  it('a bare repo URL (trailing slash, .git, ssh)', () => {
    expect(parseGitHubInput('https://github.com/acme/auth')).toEqual({
      kind: 'repo',
      repo: 'acme/auth',
    });
    expect(parseGitHubInput('github.com/acme/auth/')).toEqual({ kind: 'repo', repo: 'acme/auth' });
    expect(parseGitHubInput('https://github.com/acme/auth.git')).toEqual({
      kind: 'repo',
      repo: 'acme/auth',
    });
    expect(parseGitHubInput('git@github.com:acme/auth.git')).toEqual({
      kind: 'repo',
      repo: 'acme/auth',
    });
  });
});

describe('parseGitHubInput — shorthands', () => {
  it('owner/repo and owner/repo#123', () => {
    expect(parseGitHubInput('acme/auth')).toEqual({ kind: 'repo', repo: 'acme/auth' });
    expect(parseGitHubInput('acme/auth#482')).toEqual({
      kind: 'pr',
      repo: 'acme/auth',
      prNumber: '482',
    });
  });

  it('host-less owner/repo/pull|compare|tree forms (domain dropped)', () => {
    expect(parseGitHubInput('TryMaveaAI/mavea/pull/33')).toEqual({
      kind: 'pr',
      repo: 'TryMaveaAI/mavea',
      prNumber: '33',
    });
    expect(parseGitHubInput('acme/auth/compare/main...feat/x')).toEqual({
      kind: 'compare',
      repo: 'acme/auth',
      base: 'main',
      head: 'feat/x',
    });
    expect(parseGitHubInput('acme/auth/tree/main/src')).toEqual({
      kind: 'tree',
      repo: 'acme/auth',
      ref: 'main',
      path: 'src',
    });
  });

  it('bare #123 / 123 resolves only with a connected default repo', () => {
    expect(parseGitHubInput('#482', 'acme/auth')).toEqual({
      kind: 'pr',
      repo: 'acme/auth',
      prNumber: '482',
    });
    expect(parseGitHubInput('482', 'acme/auth')).toEqual({
      kind: 'pr',
      repo: 'acme/auth',
      prNumber: '482',
    });
    expect(parseGitHubInput('482').kind).toBe('invalid');
  });
});

describe('parseGitHubInput — invalids', () => {
  it('empty / junk / malformed return a reason, never throw', () => {
    expect(parseGitHubInput('').kind).toBe('invalid');
    expect(parseGitHubInput('just some words').kind).toBe('invalid');
    expect(parseGitHubInput('github.com/acme').kind).toBe('invalid'); // no repo
    const r = parseGitHubInput('');
    if (r.kind === 'invalid') expect(r.reason.length).toBeGreaterThan(0);
  });
});
