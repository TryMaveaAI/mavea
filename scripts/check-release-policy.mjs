#!/usr/bin/env node
// Public distribution is irreversible. Require the exact PolyForm choice, complete legal set, and
// a deliberately short-lived release authorization instead of accepting vaguely license-shaped
// metadata. This gate protects GitHub releases and npm's prepublishOnly path.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const EXPECTED_LICENSE = 'PolyForm-Noncommercial-1.0.0';
const REQUIRED_FILES = [
  'LICENSE',
  'TERMS.md',
  'DISCLAIMER.md',
  'PRIVACY.md',
  'TRADEMARKS.md',
  'SUPPORT.md',
  'SECURITY.md',
  'THIRD-PARTY.txt',
];
const packageFiles = new Set(Array.isArray(pkg.files) ? pkg.files : []);
const licenseText = existsSync(resolve(root, 'LICENSE'))
  ? readFileSync(resolve(root, 'LICENSE'), 'utf8')
  : '';
const termsText = existsSync(resolve(root, 'TERMS.md'))
  ? readFileSync(resolve(root, 'TERMS.md'), 'utf8')
  : '';
const privacyText = existsSync(resolve(root, 'PRIVACY.md'))
  ? readFileSync(resolve(root, 'PRIVACY.md'), 'utf8')
  : '';
const termsApp = existsSync(resolve(root, 'src/legal/TermsApp.tsx'))
  ? readFileSync(resolve(root, 'src/legal/TermsApp.tsx'), 'utf8')
  : '';
const privacyApp = existsSync(resolve(root, 'src/legal/PrivacyApp.tsx'))
  ? readFileSync(resolve(root, 'src/legal/PrivacyApp.tsx'), 'utf8')
  : '';

const failures = [];
if (pkg.license !== EXPECTED_LICENSE) {
  failures.push(`package.json license must be exactly ${EXPECTED_LICENSE}`);
}
for (const name of REQUIRED_FILES) {
  if (!existsSync(resolve(root, name))) failures.push(`missing ${name}`);
  if (!packageFiles.has(name)) failures.push(`package.json files omits ${name}`);
}
if (!licenseText.includes('https://polyformproject.org/licenses/noncommercial/1.0.0')) {
  failures.push('LICENSE is not PolyForm Noncommercial 1.0.0');
}
if (!licenseText.startsWith('# PolyForm Noncommercial License 1.0.0')) {
  failures.push('LICENSE has the wrong PolyForm title or version');
}
if (!licenseText.includes('## Noncommercial Purposes')) {
  failures.push('LICENSE omits the noncommercial-purpose restriction');
}
if (!licenseText.includes('## No Other Rights') || !licenseText.includes('## No Liability')) {
  failures.push('LICENSE omits retained-rights or no-liability terms');
}
if (!/^Required Notice: Copyright \(c\) 2026 Akash Maitra and Aryan Chordia$/m.test(licenseText)) {
  failures.push('LICENSE omits the maintainers’ Required Notice copyright line');
}
if (/^# MIT License$/m.test(licenseText)) failures.push('LICENSE unexpectedly contains MIT terms');
for (const marker of [
  'PolyForm Noncommercial License 1.0.0',
  'offering paid or commercial licenses',
  'merger, acquisition, asset sale',
  'same-origin proxy',
  'not a confidential or privileged channel',
  'Responsible Parties do not claim ownership of output',
]) {
  if (!termsText.includes(marker)) failures.push(`TERMS.md omits required disclosure: ${marker}`);
}
for (const marker of [
  'non-extractable, device-bound browser key',
  'no separate Mavéa user accounts',
  'speech-to-text endpoint',
  'no automatic expiration',
  'does not sell personal information',
  'does not set analytics or advertising cookies',
  'transferred to a successor',
]) {
  if (!privacyText.includes(marker))
    failures.push(`PRIVACY.md omits required disclosure: ${marker}`);
}
if (!termsApp.includes('../../TERMS.md?raw')) {
  failures.push('in-app Terms must render the canonical TERMS.md source');
}
if (!privacyApp.includes('../../PRIVACY.md?raw')) {
  failures.push('in-app Privacy must render the canonical PRIVACY.md source');
}
if (/side[- ]project|experimental side|not a company/i.test(`${termsText}\n${privacyText}`)) {
  failures.push('canonical legal copy contains unprofessional side-project wording');
}
const filesOnly = process.argv.includes('--files-only');
if (!filesOnly && process.env.MAVEA_LEGAL_RELEASE_APPROVED !== '1') {
  failures.push('MAVEA_LEGAL_RELEASE_APPROVED is not 1');
}

if (failures.length) {
  console.error(`✖ Release blocked: ${failures.join('; ')}.`);
  console.error(
    'Review the legal documents and package policy, then authorize only the exact reviewed release.',
  );
  process.exit(1);
}

console.log(
  `✓ Release policy: ${EXPECTED_LICENSE}; legal set and package contents verified${filesOnly ? '.' : '; explicit approval verified.'}`,
);
