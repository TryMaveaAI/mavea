// githubToken.ts — the user's OPTIONAL GitHub token, needed only to read PRIVATE repos directly
// from the browser (public repos work with no token at all). A token is a secret, so it is kept
// encrypted at rest with the same device-bound AES-GCM key the app's LLM BYOK keys use (keyVault's
// secrets key) — the raw token is never written to localStorage in the clear. It is read back only
// to attach `Authorization: Bearer` on a request to api.github.com over HTTPS, and only on READ
// calls (Ripple never writes to GitHub). If Web Crypto is unavailable the token simply isn't
// persisted — we never fall back to plaintext, matching how the BYOK keys degrade.
import { encryptSecret, decryptSecret } from '../../keyVault';

const STORAGE_KEY = 'mavea-ripple-gh-token';

function safeRemove(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage disabled — nothing to clear */
  }
}

/** Read the stored GitHub token, decrypting the on-disk blob. Returns '' when none is stored, or
 *  when crypto/storage is unavailable or the device key has rotated — the keyless public path. */
export async function getGithubToken(): Promise<string> {
  try {
    if (typeof localStorage === 'undefined') return '';
    const enc = localStorage.getItem(STORAGE_KEY);
    if (!enc) return '';
    return await decryptSecret(enc);
  } catch {
    return '';
  }
}

/** Whether a token is currently stored on this device — a cheap, synchronous check that never
 *  decrypts, so the intake can show a "saved" state without ever surfacing the secret. */
export function hasGithubToken(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/** Persist the token (encrypted) or, given an empty string, clear it. Resolves to whether a token
 *  is now stored. Never writes plaintext: if encryption fails the token is dropped, not saved. */
export async function setGithubToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (typeof localStorage === 'undefined') return false;
  if (!trimmed) {
    safeRemove();
    return false;
  }
  try {
    const enc = await encryptSecret(trimmed);
    localStorage.setItem(STORAGE_KEY, enc);
    return true;
  } catch {
    // Web Crypto / IndexedDB unavailable — session-less rather than plaintext on disk.
    safeRemove();
    return false;
  }
}

/** Remove the stored GitHub token from this device. */
export async function clearGithubToken(): Promise<void> {
  await setGithubToken('');
}
