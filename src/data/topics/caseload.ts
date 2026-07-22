// "Your caseload this week", a social worker's-eye triage: who's overdue for contact, who's
// flagged high-risk, and the read on the full list. A social-services profession demo, the
// same single-domain flagship pattern clinic.ts (medicine) and legal.ts (law) use. Client
// identity is deliberately never a full name — a case reference/initials only, matching how a
// real caseload list would actually be handled.
import type { ConversationSpec } from '../conversation';

export const caseload: ConversationSpec = {
  id: 'caseload',
  workspace: 'Caseload · this week',
  title: 'Your caseload this week',
  sub: 'Nineteen open cases, two flagged high-risk, one overdue for contact.',
  opener: 'Case J.M.-0192 is overdue for contact and flagged high-risk, start there.',
  switchSay: "Let's go through the caseload.",
  gather: 'Reading case notes + the contact schedule',
  found: 'Nineteen open, two high-risk, one overdue.',
  tint: '#7fb9a2',
  context: [
    { name: 'Case notes', color: 'var(--presence-soft)' },
    { name: 'Contact schedule', color: 'var(--insight)' },
    { name: 'Risk assessments', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 5,
      id: 'overdue',
      num: '1',
      delay: 0,
      props: {
        title: 'One case is overdue for contact',
        conf: 'strong',
        summary: 'J.M.-0192 was due last Thursday — a high-risk case, worth moving to today.',
        sources: [{ file: 'Contact schedule' }],
      },
    },
    {
      type: 'insight',
      col: 7,
      id: 'risk',
      num: '2',
      delay: 90,
      props: {
        title: 'Two cases carry a high-risk flag',
        stat: '2',
        delta: 'of 19 open',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'Both have a contact scheduled within the week; neither is overdue except J.M.-0192.',
        sources: [{ file: 'Risk assessments' }],
      },
    },
    {
      type: 'caseload',
      col: 12,
      id: 'caseload-list',
      delay: 180,
      props: {
        title: 'Open cases',
        icon: 'shield',
        iconColor: 'var(--presence)',
        cases: [
          {
            clientRef: 'J.M.-0192',
            status: 'Active · in-home visits',
            nextContact: 'Overdue since Thu',
            riskLevel: 'high',
            note: 'Housing instability, follow-up on shelter placement.',
          },
          {
            clientRef: 'R.K.-0207',
            status: 'Active · monthly check-in',
            nextContact: 'Fri',
            riskLevel: 'high',
            note: 'Recently reunified; monitoring the transition closely.',
          },
          {
            clientRef: 'A.T.-0118',
            status: 'Active · biweekly check-in',
            nextContact: 'Mon',
            riskLevel: 'medium',
          },
          {
            clientRef: 'S.D.-0224',
            status: 'Active · monthly check-in',
            nextContact: 'Jun 30',
            riskLevel: 'low',
          },
          {
            clientRef: 'M.P.-0055',
            status: 'Pending intake review',
            nextContact: 'Jul 3',
          },
          {
            clientRef: 'C.W.-0163',
            status: 'Active · monthly check-in',
            nextContact: 'Jul 2',
            riskLevel: 'low',
            note: 'Stable for two consecutive reviews.',
          },
        ],
        footer:
          'J.M.-0192 is the one to move today — overdue and high-risk is the combination that matters most.',
      },
    },
  ],
  proof: null,
  extras: {},
  group: 'health',
  tryChip: { label: 'Go through my caseload', route: 'topic:caseload' },
  suggests: [
    { label: 'Which cases are overdue?', icon: 'alert', route: 'topic:caseload', lead: 'Try' },
    { label: 'How is the business doing?', icon: 'chart', route: 'topic:biz' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  keywords: [
    {
      test: /\bcaseload\b|\bclient(s)? case\b|case (management|list|review)|social work(er)?/i,
      route: 'topic:caseload',
    },
  ],
};
