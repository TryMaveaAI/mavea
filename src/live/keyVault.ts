// Transparent, device-bound encryption at rest — for BYOK secrets, and (via named keys) for
// everything else Live persists.
//
// The user's API keys are their own and live client-side. When "Remember keys" is on they must
// survive a restart, but writing them as plaintext to localStorage exposes them to anything with
// same-origin storage access — other browser extensions, disk/backup imaging, profile sync. This
// vault encrypts them with an AES-GCM key that is generated once and kept **non-extractable** in
// IndexedDB: the raw key never exists in JS and can't be exported even by code, so what lands in
// localStorage is ciphertext only. There is NO passphrase — the user does nothing but provide the
// key; decryption is automatic on this device. (It is not a defense against active same-origin XSS,
// which the CSP + render-boundary sanitizing address; it removes plaintext-at-rest exfil.)
//
// Secrets aren't the only thing worth this: conversation content, remembered facts, and saved
// work are just as readable to the same passive attacker (a bypassed sanitizer, a nosy extension,
// disk/backup access) if left in the clear. Rather than reusing the secrets key for that, we mint
// a SECOND named key (`content-key-v1`, wired up by the sibling contentVault.ts) and keep every
// named key in its own IndexedDB row. Two keys cost one extra `generateKey` call and buy real
// blast-radius containment: a bug or export path that leaks the secrets key's ciphertext structure
// (or a future key that must rotate for a specific reason) never automatically hands over the
// content key too. Both keys still share this one AES-GCM/IndexedDB implementation — there is
// exactly one place in the app that touches the raw crypto.
//
// Degradation: if Web Crypto or IndexedDB is unavailable, encrypt/decrypt reject and callers fall
// back to their own documented policy (secrets → session-only storage, never plaintext; content →
// plaintext-on-disk beats losing the save, see contentVault.ts).

const DB_NAME = 'mavea-key-vault';
const STORE = 'vault';
/** The BYOK provider/search keys — kept separate from content so compromising one key's on-disk
 *  ciphertext never exposes the other. See contentVault.ts for the content-side key. */
const SECRET_KEY_ID = 'secret-key-v1';

function hasCrypto(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof TextEncoder !== 'undefined'
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result);
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB get failed'));
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB put failed'));
  });
}

// One non-extractable AES-GCM key PER NAMED KEY ID, created on first use and reused thereafter.
// Keyed by id (not a single slot) so secrets and content each get their own row in the same store.
const keyPromises = new Map<string, Promise<CryptoKey>>();

function getKey(keyId: string): Promise<CryptoKey> {
  let existing = keyPromises.get(keyId);
  if (existing) return existing;
  existing = (async () => {
    const db = await openDb();
    const stored = await idbGet(db, keyId);
    if (stored instanceof CryptoKey) return stored;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await idbPut(db, keyId, key); // CryptoKey is structured-cloneable; stays non-extractable
    return key;
  })();
  keyPromises.set(keyId, existing);
  return existing;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Encrypt a string under a named device key → base64(iv ‖ ciphertext). Rejects if crypto is
 *  unavailable. Exported so a sibling vault (contentVault.ts) can mint its own named key without
 *  a second AES-GCM implementation. */
export async function encryptWithKey(plaintext: string, keyId: string): Promise<string> {
  if (!hasCrypto()) throw new Error('crypto unavailable');
  const key = await getKey(keyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(iv.length + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.length);
  return toBase64(packed);
}

/** Decrypt a base64(iv ‖ ciphertext) blob back to the original string, under a named device key.
 *  Rejects on any failure (wrong key, corrupt blob, crypto unavailable). */
export async function decryptWithKey(blob: string, keyId: string): Promise<string> {
  if (!hasCrypto()) throw new Error('crypto unavailable');
  const key = await getKey(keyId);
  const bytes = fromBase64(blob);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/** Encrypt a string → base64(iv ‖ ciphertext) under the BYOK secrets key. Rejects if crypto is
 *  unavailable. */
export function encryptSecret(plaintext: string): Promise<string> {
  return encryptWithKey(plaintext, SECRET_KEY_ID);
}

/** Decrypt a base64(iv ‖ ciphertext) blob back to the original string, under the BYOK secrets
 *  key. Rejects on any failure. */
export function decryptSecret(blob: string): Promise<string> {
  return decryptWithKey(blob, SECRET_KEY_ID);
}
