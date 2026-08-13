import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  classifyLicense,
  commercialMediaPolicyFailures,
  commercialSpeechPolicyFailures,
  runLicenseGate,
  unreviewedEmbeddedDocs,
  unreviewedHotlinkedMedia,
} from '../scripts/check-licenses.mjs';

describe('third-party license classifier', () => {
  it.each([
    ['MIT', 'allowed'],
    ['(MIT OR Apache-2.0)', 'allowed'],
    ['MIT OR GPL-3.0-only', 'allowed'],
    ['(MIT AND BSD-3-Clause) OR GPL-3.0-only', 'allowed'],
    ['MIT AND GPL-3.0-only', 'forbidden'],
    ['(MIT OR Apache-2.0) AND GPL-3.0-only', 'forbidden'],
    ['GPL-2.0-only OR AGPL-3.0-only', 'forbidden'],
    ['LicenseRef-Proprietary', 'unknown'],
    // Bare "BSD" is not an SPDX id and could mean BSD-4-Clause — it must be classified per package.
    ['BSD', 'unknown'],
    ['', 'unknown'],
  ])('classifies %j as %s', (expression, expected) => {
    expect(classifyLicense(expression)).toBe(expected);
  });
});

describe('commercial media policy', () => {
  it('keeps shipped media, generated codecs, Reel direction, voice, and maps on the allow-list', () => {
    expect(commercialMediaPolicyFailures()).toEqual([]);
  });

  it('accepts only individually reviewed hotlinked media in shipped fixtures', () => {
    const reviewed =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Shibuya_crossing_at_night.jpg/960px-Shibuya_crossing_at_night.jpg';
    const unreviewed = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Unvetted_photo.jpg';
    const placeholder = 'https://example.com/photos/placeholder.jpg';
    const text = JSON.stringify({
      slides: [{ src: reviewed }, { src: unreviewed }, { src: placeholder }],
    });
    expect(unreviewedHotlinkedMedia(text)).toEqual([unreviewed]);
  });

  it('flags extension-less asset-CDN URLs while still skipping prop-shape placeholders', () => {
    const cdn = 'https://images.unsplash.com/photo-12345?w=800';
    const text = JSON.stringify({
      slides: [{ src: cdn }, { src: 'https://example.com/photos/placeholder.jpg' }],
    });
    expect(unreviewedHotlinkedMedia(text)).toEqual([cdn]);
  });

  it('treats an inline copy of a remote document as redistribution needing its own review', () => {
    const data = 'A'.repeat(2000);
    expect(unreviewedEmbeddedDocs({ url: 'https://example.org/x.pdf', data })).toEqual([
      'https://example.org/x.pdf',
    ]);
    expect(
      unreviewedEmbeddedDocs({
        url: 'https://ntrs.nasa.gov/citations/19950004435',
        data,
      }),
    ).toEqual([]);
    expect(unreviewedEmbeddedDocs({ url: 'https://bitcoin.org/bitcoin.pdf', data })).toEqual([
      'https://bitcoin.org/bitcoin.pdf',
    ]);
  });
});

describe('commercial speech policy', () => {
  it('pins and verifies local speech without bundling models or assuming Docker Desktop is free', () => {
    expect(commercialSpeechPolicyFailures()).toEqual([]);
  });
});

describe('release license gate', () => {
  it('keeps the generated package notices synchronized with the installed dependency graph', () => {
    expect(runLicenseGate()).toBe(0);
  });

  it('only cites mediabunny in the notice header while the dependency is still installed', () => {
    // One direction only: dropping the dependency must drop the header line, but a dependency
    // without a header mention is caught by the notice generator, not here.
    const gate = readFileSync(
      resolve(import.meta.dirname, '../scripts/check-licenses.mjs'),
      'utf8',
    );
    const header = gate.slice(
      gate.indexOf('const NOTICE_HEADER'),
      gate.indexOf('const NOTICE_NON_NPM'),
    );
    if (header.includes('mediabunny')) {
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
      expect({ ...pkg.dependencies, ...pkg.devDependencies }).toHaveProperty('mediabunny');
    }
  });

  it('keeps platform-specific native build helpers out of the portable notice', () => {
    const notice = readFileSync(resolve(import.meta.dirname, '../THIRD-PARTY.txt'), 'utf8');
    expect(notice).not.toMatch(
      /^(?:@esbuild\/|@napi-rs\/canvas-|@oxc-(?:parser|resolver)\/binding-|@rolldown\/binding-|lightningcss-).*(?:darwin|linux|win32)/m,
    );
  });
});
