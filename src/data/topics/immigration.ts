// immigration.ts, "Your green card packet, before you file" — an I-485 adjustment-of-status
// filing checked document by document, required paperwork set apart from the concurrent
// filings that help but won't sink the case if they're missing. The showcase + render-coverage
// demo for `visachecklist`, the forms family's immigration-paperwork sibling to
// `preflightchecklist`.
import type { ConversationSpec } from '../conversation';

export const immigration: ConversationSpec = {
  id: 'immigration',
  workspace: 'I-485 filing',
  title: 'Your green card packet, before you file',
  sub: 'Seven required documents, one still holding up the mailing.',
  opener:
    'Six of the seven required documents are in the packet — the birth certificate translation is the one still missing.',
  switchSay: "Let's check the filing packet.",
  gather: 'Reading the case file',
  found: "Here's the checklist, required set apart from the concurrent filings.",
  tint: '#3f8fd1',
  context: [
    { name: 'Case file · I-485', color: 'var(--presence-soft)' },
    { name: 'I-140 approval notice', color: 'var(--insight)' },
  ],
  blocks: [
    {
      type: 'visachecklist',
      col: 8,
      delay: 0,
      props: {
        title: 'I-485 — Adjustment of Status',
        icon: 'globe',
        iconColor: 'var(--presence)',
        caseType: 'I-485 · Adjustment of Status',
        documents: [
          { name: 'Form I-485 (completed & signed)', required: true, status: 'done' },
          { name: 'Form I-693 (medical exam)', required: true, status: 'pending' },
          { name: 'Two passport-style photos', required: true, status: 'done' },
          { name: 'Copy of passport biographic page', required: true, status: 'done' },
          {
            name: 'Certified birth certificate + translation',
            required: true,
            status: 'missing',
          },
          { name: 'Form I-864 Affidavit of Support', required: true, status: 'pending' },
          { name: 'I-797 approval notice (I-140)', required: true, status: 'done' },
          { name: 'Form I-765 (work permit, concurrent)', required: false, status: 'done' },
          { name: 'Form I-131 (travel permit, concurrent)', required: false, status: 'missing' },
        ],
        footer:
          'The birth certificate translation is the one required document blocking the mailing — everything else is either in hand or already pending.',
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'docs',
  tryChip: { label: 'Check my green card packet', route: 'topic:immigration' },
  suggests: [],
  keywords: [
    {
      test: /\bvisa\b|green card|i-485|i-140|adjustment of status|immigration paperwork|uscis/,
      route: 'topic:immigration',
    },
  ],
};
