// legalSeed.mts — the one legal-acceptance record every headless script pre-seeds before a
// protected route loads. Connected-feature surfaces sit behind the one-time legal gate, and a
// fresh Playwright context has never accepted it, so the audits/probes/captures that drive those
// surfaces all need the same stored record. `acceptanceRecord` wants the release actually running,
// and outside Vite `APP_RELEASE` reads 'unversioned' (there is no build), so this reads the real
// version straight from package.json instead of letting each script re-derive it.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptanceRecord, LEGAL_ACCEPTANCE_STORAGE_KEY } from '../../src/legal/acceptance';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg: { version: string } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

export const LEGAL_SEED = {
  key: LEGAL_ACCEPTANCE_STORAGE_KEY,
  value: acceptanceRecord(pkg.version),
};
