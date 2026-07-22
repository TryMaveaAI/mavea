// Automatic presence personalities — four wears of the same jelly: Hybrid (default soft
// aurora), Pip (crisp, candy-saturated — she pops for interjections and warm moments),
// Aura (living weather, the hue itself drifting), Bead (matte, data-forward — the calm
// professional). Live chooses these from the turn state and rendered content; there is no
// user-facing picker. Duet (the two-dot "you and Mavéa" face-replacement) was retired:
// listening no longer selects a style of its own, it just falls through to whichever
// personality the content already picked.
import type { Block } from '../data/conversation';
import { responseToMood, type ExpressiveSpec } from '../presence/expression';

export type PresenceStyle = 'hybrid' | 'pip' | 'aura' | 'bead';

export type PresenceStyleStatus = 'idle' | 'thinking' | 'speaking' | 'showing';

export interface PresenceStyleInput {
  status: PresenceStyleStatus;
  listening: boolean;
  interjecting?: boolean;
  spec?: ExpressiveSpec | null;
}

export function applyPresenceStyle(doc: Document, id: PresenceStyle): void {
  doc.documentElement.dataset.presenceStyle = id;
}

export function clearPresenceStyle(doc: Document): void {
  delete doc.documentElement.dataset.presenceStyle;
}

const VISUAL_RE = /(photo|image|carousel|mood|palette|video|map|diagram|story|slide|verse)/;
const STRUCTURED_RE =
  /(chart|table|matrix|grid|stat|kpi|code|pipeline|timeline|kanban|roadmap|process|flow|tree|schema|heatmap|scatter|bars|donut|gauge|checks|network|sankey)/;

function hasType(spec: ExpressiveSpec | null | undefined, re: RegExp): boolean {
  const blocks = spec?.blocks as Block[] | undefined;
  return !!blocks?.some((b) => re.test(String(b.type).toLowerCase()));
}

/** The presence style Mavéa should wear for the current turn, derived from real state/content.
 * Listening no longer selects a style of its own (Duet's face-replacement was retired) —
 * it falls through to whatever the content/mood signals already choose. */
export function automaticPresenceStyle({
  status,
  interjecting = false,
  spec,
}: PresenceStyleInput): PresenceStyle {
  if (status === 'thinking') return 'bead';
  if (interjecting) return 'pip';

  const mood = responseToMood(spec);
  if (mood === 'warm') return 'pip';
  if (mood === 'concerned') return 'hybrid';

  if (hasType(spec, VISUAL_RE)) return 'aura';
  if (hasType(spec, STRUCTURED_RE)) return 'bead';

  return 'hybrid';
}
