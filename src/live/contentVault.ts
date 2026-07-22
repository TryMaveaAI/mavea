// contentVault.ts — at-rest encryption for Live's PERSISTED CONTENT: the conversation itself,
// remembered facts, saved canvases, dashboards, tracked changes. This is the sibling of
// keyVault.ts (which guards BYOK provider/search secrets) — same AES-GCM + non-extractable
// device key machinery, same IndexedDB database, just its own named key (`content-key-v1`) so a
// compromise of one key's ciphertext never hands over the other. There is exactly one AES-GCM
// implementation in the app; this module only adapts it to what the content stores need: encrypt
// a JSON value for storage, decrypt it back.
import { encryptWithKey, decryptWithKey } from './keyVault';

const CONTENT_KEY_ID = 'content-key-v1';

/**
 * Encrypt a JSON-serializable value for at-rest storage. Falls back to plain JSON — never
 * refuses to persist — when Web Crypto/IndexedDB is unavailable. This content-only fallback is
 * deliberately different from credential storage, which always fails closed to session memory;
 * it preserves the user's work but means those exceptional saves are plain JSON at rest.
 */
export async function encryptContent(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  try {
    return await encryptWithKey(json, CONTENT_KEY_ID);
  } catch {
    return json;
  }
}

/**
 * Decrypt a stored blob back into its parsed JSON value. Rejects if `blob` isn't valid
 * ciphertext for this device's content key — including a legacy plaintext blob from before this
 * vault existed, or a device whose key was rotated/cleared. Callers fall back to parsing the raw
 * blob as plain JSON (the pre-encryption format) when this rejects.
 */
export async function decryptContent(blob: string): Promise<unknown> {
  return JSON.parse(await decryptWithKey(blob, CONTENT_KEY_ID));
}
