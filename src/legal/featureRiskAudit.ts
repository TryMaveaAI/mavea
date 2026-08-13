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
  review: { notice: 'learning', reviewed: ['AI-authored study material', 'retention claims'] },
  flashcards: { notice: 'learning', reviewed: ['AI-authored study material', 'local persistence'] },
  courses: { notice: 'learning', reviewed: ['AI-authored lessons', 'professional topics'] },
  dashboards: { notice: 'monitoring', reviewed: ['stale data', 'missed refreshes'] },
  recap: { notice: 'generated', reviewed: ['AI omissions', 'session summary'] },
  'zoom-deck': { notice: 'generated', reviewed: ['AI grouping', 'session summary'] },
  present: { notice: 'publishing', reviewed: ['audience disclosure', 'confidential content'] },
  track: { notice: 'monitoring', reviewed: ['stale data', 'not an alerting service'] },
  share: { notice: 'publishing', reviewed: ['public distribution', 'rights and accuracy'] },
  export: { notice: 'publishing', reviewed: ['document distribution', 'rights and accuracy'] },
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
    body: 'Files are staged and extracted locally, but relevant content may be sent through this deployment to the model, search, or connected provider you select. Upload only material you are authorized to share.',
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
    body: 'Refreshes can be delayed, stale, incomplete, or missed and may run only while Mavéa is open. Because you provide the API keys or connected accounts and pay those providers directly, every refresh can trigger new model, web-search, or connected-provider requests. A frequent cadence can use more of your quotas and increase third-party charges. Do not rely on this for emergencies, security, finance, operations, or other time-critical decisions.',
  },
  publishing: {
    title: 'Review before sharing',
    body: 'Check facts, citations, confidential information, permissions, copyright, and accessibility before presenting, publishing, or sending an export.',
  },
  'voice-data': {
    title: 'Speech can become provider data',
    body: 'Microphone audio is sent to the speech-transcription endpoint configured by this deployment, and the resulting transcript may be sent to your selected model provider. Endpoint operators may log or retain data under their own terms. Avoid sensitive conversations and get any consent required from nearby people before listening starts.',
  },
  credentials: {
    title: 'Remembering a key is a convenience',
    body: 'Remember stores an encrypted copy in this browser; it is not a security guarantee. Use restricted, revocable keys on a trusted device and revoke them at the provider if exposure is possible.',
  },
  'connected-actions': {
    title: 'Connected actions affect other systems',
    body: 'Data and credentials pass to your gateway and connected services. Use least-privilege access and review the destination, content, and permissions before confirming every action.',
  },
};
