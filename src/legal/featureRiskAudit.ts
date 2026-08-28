import { VOICE_DATA_NOTICE } from './voiceNotice';

/** The reviewed, primary disclosure pattern for every public feature registry entry. A feature can
 * be low-risk (`global`) while still inheriting the app-wide AI/provider notice. Tests compare this
 * object with FEATURES so adding a feature without a liability/privacy review fails CI. */
export type FeatureNoticeKind =
  | 'global'
  | 'stored-data'
  | 'generated'
  | 'learning'
  | 'upload'
  | 'code'
  | 'simulation'
  | 'monitoring'
  | 'publishing'
  | 'voice-data'
  | 'credentials'
  | 'connected-actions';

export interface FeatureRiskReview {
  notice: FeatureNoticeKind;
  reviewed: readonly string[];
}

export const FEATURE_RISK_AUDIT: Record<string, FeatureRiskReview> = {
  atlas: { notice: 'stored-data', reviewed: ['saved conversations', 'device access'] },
  memory: { notice: 'stored-data', reviewed: ['personal facts', 'forget controls'] },
  library: { notice: 'stored-data', reviewed: ['saved conversations', 'device access'] },
  deepzoom: { notice: 'learning', reviewed: ['AI accuracy', 'consequential topics'] },
  'pdf-world': { notice: 'upload', reviewed: ['document transmission', 'sensitive data'] },
  synthesis: { notice: 'upload', reviewed: ['multi-document transmission', 'third-party rights'] },
  ripple: { notice: 'code', reviewed: ['repository disclosure', 'security and deployment risk'] },
  delegate: {
    notice: 'simulation',
    reviewed: [
      'negotiation outcome',
      'employment and legal risk',
      'personal context',
      'unpredictable real people',
    ],
  },
  // A causal web invites the two readings the honesty ladder exists to refuse: that a modelled link
  // is a measured one, and that a lever's counterfactual is a forecast. Both are labelled in the
  // surface itself ("relative, not measured" · "HYPOTHETICAL (MODELED)"), and an ungrounded world
  // cannot produce an exact figure at all.
  //
  // The counterfactual now also lands ON the measured world's own cards rather than in a separately
  // banded lane, which is the higher-risk placement of the two and is why its wording is
  // constrained by construction: a shifted cause is described by trust/phrase's `shiftChip`, which
  // emits a fixed vocabulary and cannot produce a digit, so a projection can never appear beside a
  // receipt as though it were one.
  //
  // The narrated walkthrough speaks the same surface and adds no claim to it: its lines are
  // composed from fields already on screen, and a FIGURE is spoken only where the trust registry
  // can back it (world/worldStory) — an illustrative magnitude is hedged aloud as illustrative.
  //
  // Reading a cause's PARTS adds one claim and refuses another. Drawn through the component library
  // (content/lens), a hierarchy figure implies measured proportions — so a part is placed only where
  // the trust registry resolves its figure, a container is sized off its children rather than an empty
  // field of its own, and a subject whose parts nothing measured is NAMED in a list instead of drawn
  // as a chart. Breaking a part into parts is unbounded in the data and bounded in the drawing
  // (MAX_DRAWN_DEPTH), so nothing is placed where the layout cannot place it honestly.
  'living-answer': {
    notice: 'simulation',
    reviewed: [
      'modeled causation',
      'counterfactual is not a forecast',
      'counterfactual shown in place, worded without figures',
      'spoken narration asserts nothing the surface does not show',
      'parts drawn only where a figure resolves, named where none does',
      'consequential topics',
    ],
  },
  review: { notice: 'learning', reviewed: ['AI-authored study material', 'retention claims'] },
  flashcards: { notice: 'learning', reviewed: ['AI-authored study material', 'local persistence'] },
  courses: { notice: 'learning', reviewed: ['AI-authored lessons', 'professional topics'] },
  dashboards: {
    notice: 'monitoring',
    reviewed: [
      'stale data',
      'missed refreshes',
      'model-dependent grounding',
      'alert delivery',
      'third-party charges',
    ],
  },
  recap: { notice: 'generated', reviewed: ['AI omissions', 'session summary'] },
  'zoom-deck': { notice: 'generated', reviewed: ['AI grouping', 'session summary'] },
  present: { notice: 'publishing', reviewed: ['audience disclosure', 'confidential content'] },
  track: {
    notice: 'monitoring',
    reviewed: ['stale data', 'not an alerting service', 'model-dependent grounding'],
  },
  share: { notice: 'publishing', reviewed: ['public distribution', 'rights and accuracy'] },
  export: { notice: 'publishing', reviewed: ['document distribution', 'rights and accuracy'] },
  room: {
    notice: 'generated',
    reviewed: [
      'AI output presentation',
      'pointer and keyboard only',
      'no additional device access',
    ],
  },
  board: { notice: 'generated', reviewed: ['AI output presentation'] },
  focus: { notice: 'generated', reviewed: ['AI output presentation'] },
  ink: { notice: 'generated', reviewed: ['AI follow-up output'] },
  blanks: { notice: 'generated', reviewed: ['user-supplied values', 'AI calculations'] },
  'watch-me-think': { notice: 'voice-data', reviewed: ['speech transcription', 'nearby speakers'] },
  'just-listen': { notice: 'voice-data', reviewed: ['speech transcription', 'sensitive speech'] },
  whisper: { notice: 'voice-data', reviewed: ['speech transcription', 'not silent recording'] },
  ghost: { notice: 'voice-data', reviewed: ['speech transcription', 'AI-authored drafts'] },
  settings: { notice: 'credentials', reviewed: ['key storage', 'provider transmission'] },
  'morning-brief': {
    notice: 'monitoring',
    reviewed: ['missed refreshes', 'not an alerting service'],
  },
  how: { notice: 'global', reviewed: ['demonstration data', 'AI limitations'] },
};

/** Route-level twin of the feature audit. The default landing is named `landing`; every other key
 * is the exact public hash prefix from routes.ts. */
export const PUBLIC_ROUTE_RISK_AUDIT: Record<string, FeatureRiskReview> = {
  landing: { notice: 'global', reviewed: ['marketing claims', 'important-information access'] },
  '#/terms': { notice: 'global', reviewed: ['terms acceptance', 'project responsibility'] },
  '#/privacy': { notice: 'global', reviewed: ['data flows', 'retention and user controls'] },
  '#/legal': { notice: 'global', reviewed: ['complete plain-language disclosure'] },
  '#/live': { notice: 'credentials', reviewed: ['provider requests', 'uploads', 'saved data'] },
  '#/dashboards': { notice: 'monitoring', reviewed: ['refresh failures', 'stale results'] },
  '#/flashcards': { notice: 'learning', reviewed: ['AI-authored cards', 'local persistence'] },
  '#/gallery': { notice: 'global', reviewed: ['demonstration fixtures'] },
  '#/deepzoom': { notice: 'learning', reviewed: ['AI accuracy', 'professional topics'] },
  '#/courses': { notice: 'learning', reviewed: ['AI syllabus', 'professional topics'] },
  '#/course': { notice: 'learning', reviewed: ['AI lessons', 'professional topics'] },
  '#/synthesis': { notice: 'upload', reviewed: ['document transmission', 'third-party rights'] },
  '#/prism': { notice: 'upload', reviewed: ['document transmission', 'sensitive data'] },
  '#/ripple': { notice: 'code', reviewed: ['repository disclosure', 'ship risk'] },
};

export const FEATURE_NOTICE_COPY: Record<
  Exclude<FeatureNoticeKind, 'global'>,
  { title: string; body: string }
> = {
  'stored-data': {
    title: 'Saved on this browser',
    body: 'Anyone with access to this device or browser profile may be able to use saved work. Review, forget, or clear it before sharing the device.',
  },
  generated: {
    title: 'AI-generated view',
    body: 'The structure and summary can omit or misstate information. Check the original conversation before relying on it.',
  },
  learning: {
    title: 'Learning aid, not an authority',
    body: 'Lessons and study material are AI-generated and may be wrong or incomplete. Verify consequential or professional topics with authoritative sources.',
  },
  upload: {
    title: 'Files may be sent to your providers',
    body: 'Files are staged and extracted locally, but relevant content may be sent through this deployment to the model, search, or connected provider you select. Upload only material you are authorized to share. A map Mavéa builds from a document stays on this device — its claims and the page text they quote — so re-opening the same file does not bill your key again; anyone who can use this browser profile may be able to read it, and clearing site data removes it.',
  },
  code: {
    title: 'Review and test before shipping',
    body: 'Repository content and diffs may be sent to your selected model. Ripple can miss security, privacy, compatibility, or operational impact and is not a substitute for review, tests, or deployment safeguards.',
  },
  simulation: {
    title: 'A simulation, not a prediction',
    body: 'The stand-in only knows what you provide and cannot predict a real person, negotiation, or outcome. Do not treat it as legal, employment, financial, or mental-health advice.',
  },
  monitoring: {
    title: 'Not an alerting or monitoring service',
    body: 'Tracking is a best-effort convenience — a head start on checking something yourself, never a thing to rely on. Checks can be delayed, incomplete, or missed entirely, and most run only while Mavéa is open. Whether a check truly searches the live web depends on the model you pick: models differ in whether they search, whether they can be required to, and whether they say what they used, so a smaller or cheaper model may answer from memory instead. Even a completed search can return outdated or wrong figures — a value on a card is what a source claimed at check time, not a live feed — and an empty card means unverified, never zero or unchanged. Alerts are best-effort too: a check that does not run, a closed app, or blocked notifications means no alert, so never depend on one arriving. Because you provide the API keys or connected accounts and pay those providers directly, every check can trigger billed model, web-search, or connected-provider requests — the cadence you set is a spending decision, and a frequent cadence raises your third-party charges. Do not use this for emergencies, security, health, finance, operations, or any time-critical decision.',
  },
  publishing: {
    title: 'Review before sharing',
    body: 'Check facts, citations, confidential information, permissions, copyright, and accessibility before presenting, publishing, or sending an export.',
  },
  'voice-data': VOICE_DATA_NOTICE,
  credentials: {
    title: 'Remembering a key is a convenience',
    body: 'Remember stores an encrypted copy in this browser; it is not a security guarantee. Use restricted, revocable keys on a trusted device and revoke them at the provider if exposure is possible.',
  },
  'connected-actions': {
    title: 'Connected actions affect other systems',
    body: 'Data and credentials pass to your gateway and connected services. Use least-privilege access and review the destination, content, and permissions before confirming every action.',
  },
};
