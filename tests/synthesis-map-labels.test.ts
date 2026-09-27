// A fused map's contradiction and gap objects are labelled with their whole claim ("Sources disagree
// on annual treatment cost", "No coverage — Pediatric population"). Ellipsising that label cut off
// exactly the words that say WHAT disagrees or what is missing, so the rule wraps instead.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src/live/prism/synthesis/synthesis.css'), 'utf8');
const rule = /\.syn-obj\s*\{[^}]*\}/.exec(css)?.[0] ?? '';

describe('synthesis map object labels', () => {
  it('wraps rather than truncating', () => {
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).not.toMatch(/white-space:\s*nowrap/);
  });
});
