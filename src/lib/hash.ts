/** Stable FNV-1a hash as a 32-bit unsigned integer — the seed form, for PRNGs and bucketing. */
export function fnv1aInt(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable FNV-1a hash used for compact, non-cryptographic content identities. Base-36 of the
 *  integer form, so the two can never drift apart — persisted ids depend on this exact output. */
export function fnv1a(text: string): string {
  return fnv1aInt(text).toString(36);
}

const DEFAULT_LEAF_LIMIT = 24;
const DEFAULT_NODE_LIMIT = 64;
const DEFAULT_DEPTH_LIMIT = 6;
const DEFAULT_STRING_LIMIT = 96;

/**
 * Hash the leading primitive content of a value without serialising an unbounded model payload.
 * Paths and primitive types ride with values so similarly-worded but differently-shaped props do
 * not collide merely because their first strings happen to match.
 */
export function boundedValueHash(
  value: unknown,
  leafLimit = DEFAULT_LEAF_LIMIT,
  nodeLimit = DEFAULT_NODE_LIMIT,
): string {
  const parts: string[] = [];
  const seen = new WeakSet<object>();
  let leaves = 0;
  let nodes = 0;

  const visit = (current: unknown, path: string, depth: number): void => {
    if (leaves >= leafLimit || nodes >= nodeLimit) return;
    nodes += 1;

    if (current === null || typeof current !== 'object') {
      const kind = current === null ? 'null' : typeof current;
      const shown =
        typeof current === 'string' ? current.slice(0, DEFAULT_STRING_LIMIT) : String(current);
      parts.push(`${path}:${kind}:${shown}`);
      leaves += 1;
      return;
    }
    if (depth >= DEFAULT_DEPTH_LIMIT || seen.has(current)) {
      parts.push(`${path}:${seen.has(current) ? 'cycle' : 'depth'}`);
      return;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        if (leaves >= leafLimit || nodes >= nodeLimit) break;
        visit(current[index], `${path}[${index}]`, depth + 1);
      }
      return;
    }

    for (const key in current) {
      if (leaves >= leafLimit || nodes >= nodeLimit) break;
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      visit((current as Record<string, unknown>)[key], `${path}.${key}`, depth + 1);
    }
  };

  visit(value, '$', 0);
  return fnv1a(parts.join('\u0000'));
}
