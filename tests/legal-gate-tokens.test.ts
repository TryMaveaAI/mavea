// The gate's consent box mixed `var(--surface)`, a token nothing defines, so the whole color-mix was
// invalid and the box lost its tint in both themes. Every custom property the gate reads must be one
// the token sheets declare.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const gate = readFileSync(join(root, 'src/legal/legal-gate.css'), 'utf8');
const tokens = readFileSync(join(root, 'src/styles/tokens-base.css'), 'utf8');

describe('legal gate tokens', () => {
  it('reads only surface tokens that are defined', () => {
    const used = new Set([...gate.matchAll(/var\((--surface[\w-]*)/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(tokens, name).toMatch(new RegExp(`${name}\\s*:`));
  });
});
