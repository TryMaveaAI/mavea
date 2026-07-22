import { entry, type BlockRegistry } from '../registry-types';
import { StoryArc } from './StoryArc';
import { DeviceMark } from './DeviceMark';
import { Callout } from './Callout';
import { Verdictcard } from './Verdictcard';
import { Scenarioset } from './Scenarioset';
import { Accordion } from './Accordion';
import { Proscons } from './Proscons';
import { Takeaways } from './Takeaways';
import { Faq } from './Faq';
import { Tabs } from './Tabs';
import { Divider } from './Divider';
import { Pullquote } from './Pullquote';
import { Storystrip } from './Storystrip';
import { Casestudy } from './Casestudy';
import { Deflist } from './Deflist';
import { WorthIt } from './WorthIt';
import { CompanionNote } from './CompanionNote';
import { PositionCard } from './PositionCard';
import { Differential } from './Differential';
import { ReframeCard } from './ReframeCard';
import { BreathPacer } from './BreathPacer';
import { CopingMenu } from './CopingMenu';
import { SubtextDecode } from './SubtextDecode';
import { Rehearsal } from './Rehearsal';
import { MessageScriptSet } from './MessageScriptSet';
import { TalkTrack } from './TalkTrack';
import { Lifeline } from './Lifeline';
import { ScansionMark } from './ScansionMark';
import { TypeSpec } from './TypeSpec';
import { ShotList } from './ShotList';
import { BeatSheet } from './BeatSheet';
import { PromptSet } from './PromptSet';
import { ZoneLadder } from './ZoneLadder';
import { PictureSequence } from './PictureSequence';
import { Thoughtrecord } from './Thoughtrecord';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** layout family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const layoutRegistry: BlockRegistry = {
  callout: entry(Callout),
  verdictcard: entry(Verdictcard),
  scenarioset: entry(Scenarioset),
  accordion: entry(Accordion),
  proscons: entry(Proscons),
  takeaways: entry(Takeaways),
  faq: entry(Faq),
  tabs: entry(Tabs),
  divider: entry(Divider),
  pullquote: entry(Pullquote),
  storystrip: entry(Storystrip),
  casestudy: entry(Casestudy),
  deflist: entry(Deflist),
  worthit: entry(WorthIt),
  companionnote: entry(CompanionNote),
  positioncard: entry(PositionCard),
  differential: entry(Differential),
  reframecard: entry(ReframeCard),
  breathpacer: entry(BreathPacer),
  copingmenu: entry(CopingMenu),
  subtextdecode: entry(SubtextDecode),
  rehearsal: entry(Rehearsal),
  messagescriptset: entry(MessageScriptSet),
  talktrack: entry(TalkTrack),
  lifeline: entry(Lifeline),
  scansionmark: entry(ScansionMark),
  typespec: entry(TypeSpec),
  shotlist: entry(ShotList),
  beatsheet: entry(BeatSheet),
  promptset: entry(PromptSet),
  zoneladder: entry(ZoneLadder),
  picturesequence: entry(PictureSequence),
  storyarc: entry(StoryArc),
  devicemark: entry(DeviceMark),
  thoughtrecord: entry(Thoughtrecord),
};
