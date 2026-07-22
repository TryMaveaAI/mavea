import type { ReactElement } from 'react';
import type { ReelSlide } from '../reelScript';
import { resolveSlideFinish } from './registry';

export function SlideView({ slide }: { slide: ReelSlide }): ReactElement {
  'use no memo';
  const finish = resolveSlideFinish(slide);
  return <finish.Slide slots={finish.slots} />;
}
