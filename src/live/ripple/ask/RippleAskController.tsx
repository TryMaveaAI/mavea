import type { ReactElement } from 'react';
import type { Altitude } from '../model';
import { AskRail } from './AskRail';
import type { RepoAskContext } from './repoAsk';
import { useRippleAsk } from './useRippleAsk';

export interface RippleAskControllerProps {
  ctx: RepoAskContext | null;
  onClose: () => void;
  altitude: Altitude;
  seed: { text: string; nonce: number } | null;
  repo: string;
  gitRef: string;
  focusFile?: string;
}

export function RippleAskController({
  ctx,
  onClose,
  altitude,
  seed,
  repo,
  gitRef,
  focusFile,
}: RippleAskControllerProps): ReactElement {
  const { turns, busy, ask } = useRippleAsk(ctx);
  return (
    <AskRail
      open
      onClose={onClose}
      turns={turns}
      busy={busy}
      onAsk={ask}
      altitude={altitude}
      hasModel={!!ctx}
      seed={seed}
      repo={repo}
      gitRef={gitRef}
      focusFile={focusFile}
    />
  );
}
