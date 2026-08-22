/* Bump this string whenever TERMS/PRIVACY/DISCLAIMER change materially — §10 of the Terms says
   updates ship as a new effective date plus a new acceptance version, so a stale-version
   acceptance stops counting and every existing user is shown the changed documents once.
   v7: tracked readings stored in IndexedDB; tracked/"live" values declared best-effort and
   model-dependent.
   v8: a Prism/Synthesis map — a document's claims and the page text they are quoted against — is
   kept on the device, with no timer expiry, so re-opening a file does not re-bill the reader's key.
   `tests/legal-version-guard` pins the documents' digests, so the next material edit cannot ship
   without this decision being made again.
   v9: connected repositories stated outright — the files, docs, diffs and issues a feature reads
   go to the selected model provider, and a PRIVATE repository is not treated differently, so the
   scope granted is the boundary. The docs already said "repository content" in a list; what they
   never said is the part someone would want to be asked about. */
export const LEGAL_ACCEPTANCE_VERSION = '2026-08-22-connected-repos-v9';
export const LEGAL_ACCEPTANCE_STORAGE_KEY = 'mavea-legal-acceptance-v1';

interface LegalAcceptance {
  version: string;
  acceptedAt: string;
}

function valid(value: unknown): value is LegalAcceptance {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LegalAcceptance>;
  return (
    candidate.version === LEGAL_ACCEPTANCE_VERSION &&
    typeof candidate.acceptedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.acceptedAt))
  );
}

export function hasLegalAcceptance(): boolean {
  try {
    const raw = localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY);
    return raw ? valid(JSON.parse(raw)) : false;
  } catch {
    return false;
  }
}

/* Acceptance is read like an external store (LegalGate consumes it via useSyncExternalStore), not a
   one-shot mount check. This matters for two real cases the one-shot check got wrong: a tab that was
   already open when the user accepted in ANOTHER tab kept showing a stale gate until a hard reload,
   and a hash-route change never remounts the gate, so it never re-checked. Same-tab accepts notify
   the local listeners directly; the window 'storage' event carries acceptance across tabs. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to acceptance changes — this tab's accept/reset, and other tabs' via 'storage'. */
export function subscribeLegalAcceptance(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    // key === null means the whole store was cleared, which also clears the acceptance.
    if (event.key === null || event.key === LEGAL_ACCEPTANCE_STORAGE_KEY) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Persist acceptance and verify the write. Storage failure must never be mistaken for consent. */
export function acceptLegalTerms(now = new Date()): boolean {
  try {
    localStorage.setItem(
      LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: LEGAL_ACCEPTANCE_VERSION, acceptedAt: now.toISOString() }),
    );
    const accepted = hasLegalAcceptance();
    if (accepted) notify();
    return accepted;
  } catch {
    return false;
  }
}

/** Ask for acknowledgement again on the next protected route mount or reload. */
export function resetLegalAcceptance(): void {
  try {
    localStorage.removeItem(LEGAL_ACCEPTANCE_STORAGE_KEY);
    notify();
  } catch {
    /* unavailable storage is already equivalent to no recorded acceptance */
  }
}
