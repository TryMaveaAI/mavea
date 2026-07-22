// One home for the app-wide "how much visual richness can this machine afford" switch — the
// sibling of lib/theme.ts. Mavéa's full experience (a continuously-animated aurora face, blurred
// glass chrome, an animated landing aurora) is beautiful on modern hardware and punishing on a
// 2016 Intel MacBook with an integrated GPU: those effects peg the compositor and the fan. The
// "lite" tier calms exactly those always-on GPU costs while keeping the app feeling alive — and
// it applies through a single `data-perf` attribute on <html>, exactly like `data-theme`, so the
// whole thing is CSS-driven and pre-first-paint.
//
// Two layers decide the tier:
//   - The USER's choice (auto | full | lite), persisted, always authoritative when not "auto".
//   - Under "auto": a cheap first-load hardware heuristic gives the opening guess, and a runtime
//     frame-budget probe (lib/perfProbe.ts) can later record a firmer verdict. The verdict is
//     keyed to a hardware signature so it is thrown away if the machine changes.
//
// Everything that reads globals is a thin wrapper over a pure decision function so the policy is
// unit-testable without a real navigator/localStorage.

/** What the user picked. `auto` lets the app decide. */
export type PerfMode = 'auto' | 'full' | 'lite';
/** What is actually applied to the document. */
export type PerfTier = 'full' | 'lite';

/** localStorage keys, namespaced like THEME_KEY. */
export const PERF_MODE_KEY = 'mavea-perf-mode';
export const PERF_VERDICT_KEY = 'mavea-perf-verdict';

const DEFAULT_MODE: PerfMode = 'auto';

/** A firm tier verdict from the runtime probe, tied to the hardware it was measured on. */
export interface PerfVerdict {
  /** Schema version — bump to invalidate every stored verdict after a probe-logic change. */
  v: 2;
  tier: PerfTier;
  /** The hardware signature this verdict was measured on; a mismatch invalidates it. */
  sig: string;
}

// v2: the v1 policy demoted far too eagerly (any ≤4-thread machine opened lite, and one janky
// session locked lite in permanently), so every v1 verdict is untrustworthy — discard them all.
const VERDICT_VERSION = 2 as const;

// ---- pure decision core (unit-tested directly) --------------------------------------------

/** First-load guess from static hardware signals, with NO stored verdict yet.
 *  `cores` = navigator.hardwareConcurrency, `memGB` = navigator.deviceMemory.
 *  A LOW value is a real signal (few cores / little RAM → weak); a HIGH value proves nothing
 *  (deviceMemory is clamped at 8 and absent in Safari), so we only ever demote on the low end and
 *  let the runtime probe catch a machine that looks capable on paper but janks in practice.
 *
 *  The bar is deliberately "unmistakable potato only". hardwareConcurrency counts THREADS, so a
 *  dual-core 2018–2020 MacBook Air reports 4 — and those machines run the full experience fine,
 *  so 4 must open full. Demoting up front is reserved for ≤2 threads (a 2015 12" MacBook) or ≤4GB
 *  reported RAM; everything else opens full and earns a demotion only from measured jank. */
export function heuristicTier(cores: number | undefined, memGB: number | undefined): PerfTier {
  if (typeof cores === 'number' && cores > 0 && cores <= 2) return 'lite';
  if (typeof memGB === 'number' && memGB > 0 && memGB <= 4) return 'lite';
  return 'full';
}

/** The final tier. Pure: pass the mode, any stored verdict, the CURRENT hardware signature, and
 *  the heuristic fallback. `full`/`lite` overrides always win; under `auto` a still-valid verdict
 *  (matching signature) wins, else the heuristic. */
export function resolveTier(
  mode: PerfMode,
  verdict: PerfVerdict | null,
  currentSig: string,
  heuristic: PerfTier,
): PerfTier {
  if (mode === 'full') return 'full';
  if (mode === 'lite') return 'lite';
  if (verdict && verdict.v === VERDICT_VERSION && verdict.sig === currentSig) return verdict.tier;
  return heuristic;
}

// ---- global-reading wrappers ---------------------------------------------------------------

interface Hardware {
  cores: number | undefined;
  memGB: number | undefined;
  dpr: number | undefined;
}

function currentHardware(): Hardware {
  if (typeof navigator === 'undefined')
    return { cores: undefined, memGB: undefined, dpr: undefined };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    memGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
  };
}

/** A compact fingerprint of the machine — cores × memory × pixel ratio. Stored alongside a
 *  verdict so that swapping to different hardware (or the browser changing what it reports)
 *  discards a stale verdict rather than trusting it. */
export function hardwareSignature(): string {
  const { cores, memGB, dpr } = currentHardware();
  return `${cores ?? '?'}x${memGB ?? '?'}x${dpr ?? '?'}`;
}

/** The persisted user choice, defaulting to `auto` on empty/invalid/unreadable storage. */
export function readPerfMode(): PerfMode {
  if (typeof localStorage === 'undefined') return DEFAULT_MODE;
  try {
    const v = localStorage.getItem(PERF_MODE_KEY);
    return v === 'full' || v === 'lite' || v === 'auto' ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persist the user choice; a no-op when storage is unavailable. */
export function writePerfMode(mode: PerfMode): void {
  try {
    localStorage.setItem(PERF_MODE_KEY, mode);
  } catch {
    /* storage unavailable — the in-session choice still applies via applyPerfTier */
  }
}

/** The stored probe verdict, or null when absent/invalid/stale-schema/unreadable. */
export function readVerdict(): PerfVerdict | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PERF_VERDICT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PerfVerdict>;
    if (
      parsed &&
      parsed.v === VERDICT_VERSION &&
      (parsed.tier === 'full' || parsed.tier === 'lite') &&
      typeof parsed.sig === 'string'
    ) {
      return { v: VERDICT_VERSION, tier: parsed.tier, sig: parsed.sig };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist a probe verdict for the current hardware. */
export function writeVerdict(tier: PerfTier): void {
  try {
    const v: PerfVerdict = { v: VERDICT_VERSION, tier, sig: hardwareSignature() };
    localStorage.setItem(PERF_VERDICT_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — verdict simply won't persist across reloads */
  }
}

/** The static-hardware guess for the current machine, read from globals. The probe uses it to
 *  decide whether a stored lite verdict deserves a re-audit (capable-on-paper machines do). */
export function heuristicTierNow(): PerfTier {
  const { cores, memGB } = currentHardware();
  return heuristicTier(cores, memGB);
}

/** Resolve the tier to apply right now, reading every input from globals. Used at boot. */
export function resolveTierNow(): PerfTier {
  const { cores, memGB } = currentHardware();
  return resolveTier(
    readPerfMode(),
    readVerdict(),
    hardwareSignature(),
    heuristicTier(cores, memGB),
  );
}

/** Reflect a tier onto the document (`data-perf` on <html>), the twin of applyTheme. Defaults to
 *  the running document; takes one explicitly to mirror applyTheme's signature. */
export function applyPerfTier(tier: PerfTier, doc: Document = document): void {
  doc.documentElement.dataset.perf = tier;
}

/** The tier currently reflected on the document, or 'full' if unset. */
export function currentAppliedTier(doc: Document = document): PerfTier {
  return doc.documentElement.dataset.perf === 'lite' ? 'lite' : 'full';
}
