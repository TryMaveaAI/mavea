// The conversation registry. It assembles every ConversationSpec into TOPICS (keyed by
// TopicId) and TOPIC_LIST (a deterministic order).
//
// Order matters: routeText walks TOPIC_LIST and returns the first keyword match, so
// narrowly-keyworded topics are listed before broader ones (e.g. `offers` before `career`,
// `travel` before `trip`), and the `money` noun-rule is deliberately resolved last by the
// router so a global verb like "prove" wins over a topic switch.
import type { TopicId } from '../../types/mavea';
import type { ConversationSpec } from '../conversation';

// ===== everyday topics =====
import { money } from './money';
import { sleep } from './sleep';
import { fitness } from './fitness';
import { week } from './week';
import { trip } from './trip';
import { decision } from './decision';
import { meal } from './meal';
import { gift } from './gift';
import { career } from './career';
import { biz } from './biz';
import { oss } from './oss';
import { explain } from './explain';
import { code } from './code';
import { perf } from './perf';

// ===== creation layer, build a tool from a site =====
import { build } from './build';
import { content } from './content';

// ===== business board story =====
import { revenue } from './revenue';
import { churn } from './churn';
import { pipeline } from './pipeline';
import { sentiment } from './sentiment';
import { runway } from './runway';
import { hiring } from './hiring';
import { dashboardkit } from './dashboardkit';

// ===== personal · home · sports · learning =====
import { travel } from './travel';
import { sports } from './sports';
import { study } from './study';
import { family } from './family';
import { wedding } from './wedding';

// ===== additional sessions =====
import { energy } from './energy';
import { labs } from './labs';
import { offers } from './offers';
import { lease } from './lease';
import { screenshot } from './screenshot';

// ===== flagship conversations, wide, multi-block flows exercising the extended library =====
import { bizreview } from './bizreview';
import { healthdash } from './healthdash';
import { research } from './research';
import { product } from './product';
import { creative } from './creative';
import { compsci } from './compsci';
import { clinic } from './clinic';
import { legal } from './legal';
import { caseload } from './caseload';

// ===== new block family showcases =====
import { compose } from './compose';
import { planner } from './planner';
import { budget } from './budget';
import { lookup } from './lookup';

// ===== AI/ML & investor topics =====
import { aiproduct } from './aiproduct';
import { mleval } from './mleval';

// ===== STEM & arts showcases =====
import { music } from './music';
import { math } from './math';

// ===== fun & family, kid wonder, game night, the new puppy, cooking together =====
import { space } from './space';
import { dino } from './dino';
import { trivia } from './trivia';
import { cookkids } from './cookkids';
import { puppy } from './puppy';

// ===== fans & worried parents, game day, the fantasy lineup, a child's fever =====
import { gameday } from './gameday';
import { fantasy } from './fantasy';
import { symptom } from './symptom';

// ===== UI-kit showcases, the full component library as living product surfaces =====
import { designsys } from './designsys';
import { appbuild } from './appbuild';
import { account } from './account';
import { booking } from './booking';

// ===== standalone everyday sessions =====
import { flying } from './flying';
import { warehouse } from './warehouse';
import { immigration } from './immigration';

// ===== 600-block coverage showcases (fixtures for the newest analytical + hobby blocks) =====
import { labcanvas } from './labcanvas';
import { makerplay } from './makerplay';

/**
 * Ordered list. Specific-keyword topics precede broad ones so the first-match router
 * resolves the way a person would expect. `offers` precedes `career` (so "two offers"
 * routes to the side-by-side comparison, not the single-offer topic); `travel` precedes
 * `trip` (Kyoto vs Lisbon); the harvest business set is grouped together.
 */
export const TOPIC_LIST: ConversationSpec[] = [
  // Flagship conversations LEAD the list. Their keyword rules are deliberately the most
  // specific (proper nouns / multi-word phrases: "business review" & "qbr", "azores"/
  // "moodboard"/"photo-story", "glp-1"/"semaglutide", "atlas"/"the rfc", "health
  // dashboard"/"ldl"). First-match precedence means they must precede the BROADER legacy
  // rules they overlap with, e.g. revenue's bare `board`/`quarterly` (which "board review"
  // and "health dashBOARD" would otherwise hit) and trip's bare `trip` ("azores TRIP").
  // They never steal narrower legacy traffic: none of these phrases is owned by an
  // earlier topic, so putting them first only fixes the flagship phrases.
  bizreview,
  healthdash,
  research,
  compsci,
  clinic,
  legal,
  caseload,
  product,
  creative,
  // ── fun & family + fans + a worried parent ──
  // These eight casual sessions lead the everyday block so their keywords win the
  // first-match race over the BROADER legacy topics they intentionally overlap with:
  //  • `gameday` ("score"/"game"/"tonight") before `sports` ("score"/"game"), a live
  //    Warriors–Lakers night beats the simple baseball scoreboard.
  //  • `cookkids` ("cook with my kids"/"mini pizza") before `meal` (bare "cook"/"recipe")
  //, a kid-friendly cook beats the fridge-dinner topic.
  //  • `symptom` ("my kid has a fever") and `trivia` ("family game night") before
  //    `family` (bare "family"/"kids"), the fever walk-through and the trivia round win
  //    their phrases; generic "family week" still falls through to `family`.
  //  • `fantasy` ("lineup"/"start-sit"/"week 11") is proper-noun-specific and never
  //    collides with the `week` planner.
  // `space`/`dino`/`puppy` carry only their own proper nouns, so position is free,   // they're grouped here for a coherent "fun" cluster.
  music,
  space,
  dino,
  gameday,
  fantasy,
  symptom,
  trivia,
  cookkids,
  puppy,
  // UI-kit showcases, reachable by their specific product/design nouns (design system,
  // navbar, ⌘K, "set up my account", "book a studio session"). Ambiguous tokens (bare
  // "dashboard"/"settings") were dropped from their keywords so they don't shadow the
  // business/code topics below.
  designsys,
  appbuild,
  account,
  booking,
  // Ordering below encodes routing precedence (first keyword match wins):
  //  • `travel` (Kyoto) before `trip` (Lisbon), "kyoto trip" -> the Kyoto session.
  //  • `study` before `explain`, an exam query beats the compound-interest explainer.
  //  • `labs` before `explain`, "explain my blood test" -> labs, not the explainer.
  //  • the harvest board-docs story (`revenue`/`churn`) before the simple `biz` topic.
  // new block family showcases, specific keyword triggers, before the broad everyday topics
  compose,
  planner,
  budget,
  lookup,
  money,
  sleep,
  fitness,
  week,
  travel,
  trip,
  decision,
  meal,
  gift,
  offers,
  career,
  // creation layer, CRM/content build flows. Keywords are CRM/content-specific (won't
  // hijack generic verbs like "make me a one-pager"), placed ahead of the business set so
  // "build me a CRM from my site" resolves here rather than to a metrics topic.
  build,
  content,
  // business board story (specific) ahead of the simple investor topic
  revenue,
  churn,
  pipeline,
  sentiment,
  runway,
  aiproduct,
  mleval,
  hiring,
  biz,
  oss,
  study,
  math,
  labs,
  explain,
  // perf precedes code: its keywords are perf-specific ("slow query", "flame graph", "p99",
  // "explain plan") and never collide with code's dark-mode/PR vocabulary.
  perf,
  code,
  // personal / sports
  sports,
  family,
  wedding,
  // extra distinct everyday sessions
  energy,
  lease,
  screenshot,
  // demo + gallery showcase of the living-dashboard widgets (specific keywords; no collisions)
  dashboardkit,
  // standalone, keyword-only sessions with no narrative overlap with anything above
  flying,
  warehouse,
  immigration,
  // 600-block coverage showcases — narrow multi-word keywords, listed LAST so they never
  // steal narrower legacy traffic; primarily fixtures for #/gallery + reference examples.
  labcanvas,
  makerplay,
];

/** The registry, keyed by topic id. */
export const TOPICS = Object.fromEntries(TOPIC_LIST.map((t) => [t.id, t])) as Record<
  TopicId,
  ConversationSpec
>;
