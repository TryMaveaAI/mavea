// Types for the license gate (the .mjs stays plain Node-runnable; this gives the credits
// completeness test full typing).
export const REVIEWED_HOTLINKED_MEDIA: Map<string, string>;
export function unreviewedHotlinkedMedia(text: string): string[];
export function unreviewedEmbeddedDocs(parsed: unknown): string[];
export function commercialMediaPolicyFailures(): string[];
export function commercialSpeechPolicyFailures(): string[];
export function classifyLicense(expr: string): 'allowed' | 'forbidden' | 'unknown';
export function runLicenseGate(options?: { notice?: boolean }): number;
