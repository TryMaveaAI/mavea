import type { ModelConfig } from '../../types/mavea';
import { providerInfo } from './info';

let replayBlocked = false;

export type ProviderGenerationBlockedReason = 'replay' | 'unconfigured';

/** A local policy refusal. No provider request was attempted. */
export class ProviderGenerationBlockedError extends Error {
  readonly code = 'provider-generation-blocked';

  constructor(readonly reason: ProviderGenerationBlockedReason) {
    super(
      reason === 'replay'
        ? 'Model spending is disabled during replays.'
        : 'No model is configured.',
    );
    this.name = 'ProviderGenerationBlockedError';
  }
}

/** Set by Live when it boots into a baked tour or demo replay. */
export function configureProviderSpending(blocked: boolean): void {
  replayBlocked = blocked;
}

export function isProviderSpendingBlocked(): boolean {
  return replayBlocked;
}

export function modelCanGenerate(cfg: ModelConfig): boolean {
  const info = providerInfo(cfg.provider);
  return !!cfg.model.trim() && (!info.needsKey || !!cfg.apiKey?.trim());
}

export function providerGenerationAllowed(cfg: ModelConfig): boolean {
  return !replayBlocked && modelCanGenerate(cfg);
}

export function assertProviderGenerationAllowed(cfg: ModelConfig): void {
  if (replayBlocked) throw new ProviderGenerationBlockedError('replay');
  if (!modelCanGenerate(cfg)) throw new ProviderGenerationBlockedError('unconfigured');
}
