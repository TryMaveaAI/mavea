import { castMember } from './demo/cast';
import { peekDemoPersona } from './demo/demoEntry';
import { peekTourChapter, peekTourMode } from './tour/tourEntry';

/** These chapters require setup, live input, or a standalone surface outside the public replay. */
export function isShowcaseChapter(id: string): boolean {
  return !['connect', 'yours', 'settings', 'deepzoom', 'synthesis', 'manage-flashcards'].includes(
    id,
  );
}

/** Match exact paths: a query must never turn another application surface into a public one. */
export function isShowcaseRoute(hash: string): boolean {
  const path = hash.split('?')[0];
  if (['', '#', '#/', '#/legal', '#/terms', '#/privacy'].includes(path)) return true;
  if (path !== '#/live') return false;
  if (peekTourMode()) {
    const chapter = new URLSearchParams(hash.split('?')[1]).get('ch') ?? peekTourChapter();
    return !chapter || isShowcaseChapter(chapter);
  }
  const persona = peekDemoPersona();
  return !!persona && !!castMember(persona);
}
