// Everything a script running in THIS world can learn about the reader's key. Loaded at
// document_start by the content-script extensions (isolated world for one, main world for the
// other), so the listeners and the fetch wrapper below are in place before the app boots.
//
// Nothing here ever returns the key itself: the collector answers yes/no per place, and names
// headers and storage keys without their values, so a report can be printed and committed.

const PROBE_CONFIG_EVENT = 'mavea-live-v2';
const PROBE_MAX_TEXT = 200_000;

/** Every `mavea-live-v2` broadcast this world saw, as text. In the isolated world an object
 *  `detail` made by the page reads as null, which is itself a finding. */
const probeConfigEvents = [];
addEventListener(
  PROBE_CONFIG_EVENT,
  (event) => {
    let text;
    try {
      text = event.detail == null ? null : JSON.stringify(event.detail);
    } catch {
      text = null;
    }
    probeConfigEvents.push(text);
    if (probeConfigEvents.length > 50) probeConfigEvents.shift();
  },
  true,
);

/** Requests this world's `fetch` / XHR saw. Patching them in the isolated world only wraps the
 *  extension's own copies, so there it should record nothing the app sent. */
const probeRequests = [];
const probePageFetch = globalThis.fetch;
globalThis.fetch = function probeFetch(input, init) {
  try {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const lines = [];
    headers.forEach((value, name) => lines.push({ name, value }));
    probeRequests.push({ url: String(url), headers: lines });
  } catch {
    /* an unreadable request is simply not recorded */
  }
  return probePageFetch.apply(this, arguments);
};
const probeSetHeader = XMLHttpRequest.prototype.setRequestHeader;
XMLHttpRequest.prototype.setRequestHeader = function probeXhrHeader(name, value) {
  probeRequests.push({ url: 'xhr', headers: [{ name, value: String(value) }] });
  return probeSetHeader.call(this, name, value);
};

function probeBytesToText(bytes) {
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

/** Flatten any structured-cloned IndexedDB value into the strings inside it. */
async function probeTextOf(value, depth = 0) {
  if (value == null || depth > 6) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  if (value instanceof CryptoKey) return '';
  if (value instanceof Blob) return (await value.text()).slice(0, PROBE_MAX_TEXT);
  if (value instanceof ArrayBuffer) return probeBytesToText(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return probeBytesToText(value);
  const parts = [];
  for (const [k, v] of Object.entries(value)) parts.push(k, await probeTextOf(v, depth + 1));
  return parts.join('\n').slice(0, PROBE_MAX_TEXT);
}

function probeOpen(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    // A database that vanished between databases() and open() must not be re-created by us.
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function probeAll(db, store, method) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store)[method]();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function probeFromBase64(text) {
  try {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function probeStorageEntries(read) {
  try {
    const storage = read();
    const entries = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key != null) entries.push([key, storage.getItem(key) ?? '']);
    }
    return entries;
  } catch {
    return [];
  }
}

// Called by each extension's own bridge (a message listener, or the worker's executeScript).
async function extensionProbeCollect(needle) {
  const has = (text) => typeof text === 'string' && text.includes(needle);
  const world = globalThis.chrome?.runtime?.id ? 'isolated' : 'main';

  // DOM
  const html = document.documentElement.outerHTML;
  const attributesWithKey = [];
  for (const el of document.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      if (has(attr.value)) attributesWithKey.push(`${el.tagName.toLowerCase()}[${attr.name}]`);
    }
  }
  const fields = [...document.querySelectorAll('input, textarea')];
  const inputValueAttribute = fields.some((el) => has(el.getAttribute('value')));
  const inputValueProperty = fields.some((el) => has(el.value));

  // Web storage
  const local = probeStorageEntries(() => localStorage);
  const session = probeStorageEntries(() => sessionStorage);
  const localWithKey = local.filter(([k, v]) => has(k) || has(v)).map(([k]) => k);
  const sessionWithKey = session.filter(([k, v]) => has(k) || has(v)).map(([k]) => k);
  const secretsBlobPresent = local.some(([k, v]) => k === 'mavea-live-v2:secrets' && v.length > 0);

  // IndexedDB — every database this origin holds, every store, every value.
  const databases = [];
  const cryptoKeys = [];
  let idbError = null;
  try {
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const summary = { name, stores: [], keyFound: false };
      const db = await probeOpen(name);
      try {
        for (const store of db.objectStoreNames) {
          const values = await probeAll(db, store, 'getAll');
          const keys = await probeAll(db, store, 'getAllKeys');
          summary.stores.push({ store, rows: values.length });
          if (keys.some((k) => has(String(k)))) summary.keyFound = true;
          for (const value of values) {
            if (value instanceof CryptoKey) cryptoKeys.push({ db: name, store, key: value });
            else if (has(await probeTextOf(value))) summary.keyFound = true;
          }
        }
      } finally {
        db.close(); // an open handle would block Forget's deleteDatabase
      }
      databases.push(summary);
    }
  } catch (error) {
    idbError = String(error);
  }

  // A non-extractable key must refuse export — and yet it still works for anyone on the origin.
  const keyReports = [];
  for (const { db, store, key } of cryptoKeys) {
    let exportable = false;
    for (const format of ['raw', 'jwk']) {
      try {
        await crypto.subtle.exportKey(format, key);
        exportable = true;
      } catch {
        /* expected: non-extractable */
      }
    }
    let decryptsSavedKey = false;
    if (key.usages.includes('decrypt')) {
      for (const [, value] of local) {
        const bytes = probeFromBase64(value);
        if (!bytes || bytes.length < 29) continue;
        try {
          const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: bytes.slice(0, 12) },
            key,
            bytes.slice(12),
          );
          if (has(probeBytesToText(new Uint8Array(plain)))) decryptsSavedKey = true;
        } catch {
          /* not sealed under this key */
        }
      }
    }
    keyReports.push({
      db,
      store,
      extractable: key.extractable,
      exportable,
      usages: key.usages,
      decryptsSavedKey,
    });
  }

  // Caches and cookies
  let maveaCaches = [];
  try {
    maveaCaches = (await caches.keys()).filter((name) => /^mavea/i.test(name));
  } catch {
    /* no Cache Storage here */
  }

  // The app's own decrypt lives in module scope; nothing on the global object should reach it.
  const vaultGlobals = Object.getOwnPropertyNames(globalThis).filter(
    (name) => /decrypt|vault|secret/i.test(name) && !name.startsWith('extensionProbe'),
  );

  const keyedRequests = probeRequests.filter((r) =>
    r.headers.some((h) => has(h.value) || has(r.url)),
  );

  return {
    world,
    href: location.href.replace(needle, '<key>'),
    htmlHasKey: has(html),
    attributesWithKey,
    inputValueAttribute,
    inputValueProperty,
    localWithKey,
    sessionWithKey,
    secretsBlobPresent,
    maveaLocalKeys: local.map(([k]) => k).filter((k) => /^mavea/i.test(k)),
    databases,
    idbError,
    cryptoKeys: keyReports,
    maveaCaches,
    cookieHasKey: has(document.cookie),
    vaultGlobals,
    appDecryptReachable: vaultGlobals.some((name) => typeof globalThis[name] === 'function'),
    configEvents: probeConfigEvents.length,
    configEventsReadable: probeConfigEvents.filter((t) => t != null).length,
    configEventHasKey: probeConfigEvents.some(has),
    requestsSeen: probeRequests.length,
    requestsWithKey: keyedRequests.map((r) => ({
      url: r.url.replace(needle, '<key>').slice(0, 160),
      headers: r.headers.filter((h) => has(h.value)).map((h) => h.name),
    })),
  };
}
