import { describe, expect, it } from 'vitest';

import { classifyLicense } from '../scripts/check-licenses.mjs';

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
    ['', 'unknown'],
  ])('classifies %j as %s', (expression, expected) => {
    expect(classifyLicense(expression)).toBe(expected);
  });
});
