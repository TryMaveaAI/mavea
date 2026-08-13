import { entry, type BlockRegistry } from '../registry-types';
import { MessageDraft } from './MessageDraft';
import { ChatThread } from './ChatThread';
import { Dialogue } from './Dialogue';
import { Variants } from './Variants';
import { Verse } from './Verse';
import { SlideDeck } from './SlideDeck';
import { VoiceStyle } from './VoiceStyle';
import { Screenplay } from './Screenplay';
import { SocialPost } from './SocialPost';
import { Longread } from './Longread';
import { IdeaBoard } from './IdeaBoard';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** compose family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const composeRegistry: BlockRegistry = {
  messagedraft: entry(MessageDraft),
  chatthread: entry(ChatThread),

  dialogue: entry(Dialogue),

  variants: entry(Variants),

  verse: entry(Verse),

  slidedeck: entry(SlideDeck),
  voicestyle: entry(VoiceStyle),

  screenplay: entry(Screenplay),

  socialpost: entry(SocialPost),

  longread: entry(Longread),
  ideaboard: entry(IdeaBoard),
};
