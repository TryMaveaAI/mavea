// "The MSA, before you sign", a lawyer's-eye contract review: the buried risk, the exact
// clause spotlighted in the document, how the terms stack up against market, the dates that
// matter, and the recommendation. A legal profession demo; puts the docview in-document
// spotlight to work on a contract clause, alongside compare/timeline/callout/kpi.
import type { ConversationSpec } from '../conversation';

export const legal: ConversationSpec = {
  id: 'legal',
  workspace: 'Vendor MSA · review',
  title: 'The MSA, before you sign',
  sub: 'One buried clause does most of the damage, here it is, in context.',
  opener:
    'The terms are mostly standard; the auto-renewal with a 90-day notice window is the trap. Look here.',
  switchSay: "Let's read the contract.",
  gather: 'Reading the MSA, your playbook, and the redline history',
  found: 'Mostly market-standard, except one renewal clause worth a redline.',
  tint: '#9b8cff',
  context: [
    { name: 'Acme_MSA_v3.pdf · 18 pp', color: 'var(--presence-soft)' },
    { name: 'Your contract playbook', color: 'var(--insight)' },
    { name: 'Market terms (CARTA)', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 5,
      id: 'risk',
      num: '1',
      delay: 0,
      props: {
        title: 'Auto-renewal + 90-day notice is the real risk',
        stat: '§8.2',
        delta: 'off-market',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'Silent auto-renew for a full year unless you give notice 90 days out, twice your playbook’s limit.',
        sources: [{ file: 'Acme_MSA_v3.pdf', loc: '§8.2' }],
      },
    },
    {
      type: 'kpi',
      col: 7,
      delay: 90,
      props: {
        title: 'Deal terms at a glance',
        icon: 'doc',
        iconColor: 'var(--presence)',
        kpis: [
          { val: '$240k', label: 'TCV' },
          { val: '24 mo', label: 'term' },
          { val: '1× fees', label: 'liability cap', color: 'var(--warning)' },
          { val: '90 days', label: 'notice window', color: 'var(--danger)' },
        ],
        footer:
          'Cap at 1× fees is light for a data processor; the notice window is the headline issue.',
      },
    },
    {
      type: 'docview',
      col: 12,
      id: 'clause',
      delay: 180,
      props: {
        title: 'The clause that matters, in the document',
        icon: 'doc',
        iconColor: 'var(--presence)',
        source: 'Acme_MSA_v3.pdf · uploaded · 18 pp',
        page: { n: 11, of: 18 },
        blocks: [
          { kind: 'h2', text: '8. Term & Termination' },
          {
            kind: 'p',
            text: '8.1  This Agreement begins on the Effective Date and continues for an initial term of twenty-four (24) months.',
          },
          {
            kind: 'p',
            text: '8.2  Thereafter it renews automatically for successive twelve (12) month terms unless either party gives written notice of non-renewal at least ninety (90) days before the end of the then-current term.',
            spot: true,
          },
          {
            kind: 'p',
            text: '8.3  Fees for any renewal term may increase by up to the lesser of 7% or CPI.',
          },
        ],
        note: 'Two problems in one sentence: it auto-renews for a <b>full year</b>, and the <b>90-day</b> notice (your playbook caps at 30). Miss the window and you’re locked in another year at +7%.',
        footer:
          'I pulled §8.2 out of 18 pages, dimmed the rest, and flagged exactly the two terms to push back on.',
      },
    },
    {
      type: 'pdfreader',
      col: 5,
      delay: 220,
      props: {
        title: 'Or read the whole thing',
        icon: 'doc',
        iconColor: 'var(--text-muted)',
        source: 'Acme_MSA_v3.pdf · 18 pp',
        pages: [
          {
            blocks: [
              { kind: 'h1', text: 'Master Services Agreement' },
              { kind: 'caption', text: 'Acme Data Inc. · effective Mar 1, 2026' },
              { kind: 'h2', text: '1. Definitions' },
              {
                kind: 'p',
                text: '“Services” means the data-processing services described in each Order Form. “Confidential Information” means non-public information disclosed by either party.',
              },
              { kind: 'h2', text: '2. Provision of Services' },
              {
                kind: 'p',
                text: 'Provider will perform the Services with reasonable skill and care and in accordance with the applicable Order Form and Documentation.',
              },
            ],
          },
          {
            blocks: [
              { kind: 'h2', text: '7. Fees & Payment' },
              {
                kind: 'p',
                text: 'Customer will pay the fees in each Order Form within thirty (30) days of invoice. Late amounts accrue interest at 1.0% per month.',
              },
              { kind: 'h2', text: '8. Term & Termination' },
              {
                kind: 'p',
                text: '8.1 Initial term of twenty-four (24) months from the Effective Date. 8.2 Thereafter auto-renews for 12-month terms unless either party gives 90 days’ written notice.',
              },
            ],
          },
          {
            blocks: [
              { kind: 'h2', text: '11. Liability' },
              {
                kind: 'p',
                text: '11.1 Each party’s aggregate liability is capped at the fees paid in the 12 months preceding the claim (1× fees). 11.2 Neither party is liable for indirect or consequential damages.',
              },
              { kind: 'h2', text: '14. Governing Law' },
              {
                kind: 'p',
                text: 'This Agreement is governed by the laws of the State of Delaware.',
              },
            ],
          },
        ],
        footer:
          'The full document if you want to scroll, but §8.2 above is the only line that needs a redline.',
      },
    },
    {
      type: 'compare',
      col: 7,
      delay: 260,
      props: {
        eyebrow: 'This MSA vs. your playbook vs. market',
        options: [
          { name: 'Acme MSA' },
          { name: 'Your playbook', pick: true },
          { name: 'Market (median)' },
        ],
        criteria: [
          {
            label: 'Renewal notice',
            cells: [{ v: '90 days' }, { v: '30 days', win: true }, { v: '60 days' }],
          },
          {
            label: 'Liability cap',
            cells: [{ v: '1× fees' }, { v: '12× / TCV', win: true }, { v: '12 mo fees' }],
          },
          {
            label: 'Renewal uplift',
            cells: [{ v: 'CPI/7%' }, { v: 'CPI/5%', win: true }, { v: 'CPI/5%' }],
          },
          {
            label: 'Termination for convenience',
            cells: [{ v: 'No' }, { v: 'Yes (30d)', win: true }, { v: 'Sometimes' }],
          },
        ],
        recommendation:
          '<b>Three redlines:</b> notice 90→30 days, cap 1×→12× fees, add 30-day termination-for-convenience. The uplift is fine. None of these are unusual asks at this TCV.',
      },
    },
    {
      type: 'timeline',
      col: 5,
      delay: 320,
      props: {
        eyebrow: 'The dates that bind you',
        events: [
          { time: 'Mar 1, 2026', title: 'Effective date', color: 'var(--text-muted)' },
          {
            time: 'Nov 30, 2027',
            title: 'Notice deadline (90 days out)',
            tag: 'calendar this',
            color: 'var(--danger)',
          },
          { time: 'Feb 28, 2028', title: 'Initial term ends', color: 'var(--warning)' },
          { time: 'Mar 1, 2028', title: 'Silent auto-renewal → +1 yr', color: 'var(--danger)' },
        ],
      },
    },
    {
      type: 'callout',
      col: 12,
      delay: 380,
      props: {
        title: 'Recommendation',
        icon: 'shield',
        iconColor: 'var(--warning)',
        tone: 'warn',
        kicker: 'Before signing',
        body: 'Sign-ready <b>after three redlines</b> to §8.2 and the liability cap. The economics are fine; the renewal mechanics are the only real exposure.',
        points: [
          'Redline §8.2: notice 90 → 30 days; consider deleting auto-renew entirely.',
          'Raise the liability cap from 1× to 12× annual fees (data processor).',
          'Either way, <b>calendar the Nov 30 2027 notice deadline now</b>.',
        ],
        footer:
          'Want me to draft the redline markup and a one-paragraph cover note to their counsel?',
      },
    },
    {
      type: 'casebrief',
      col: 12,
      delay: 440,
      props: {
        title: 'The precedent behind that redline',
        icon: 'proof',
        iconColor: 'var(--presence)',
        citation: '812 F. Supp. 2d 501 (D. Del. 2019)',
        parties: { plaintiff: 'Bell Fabrication, Inc.', defendant: 'Meridian Systems, LLC' },
        facts:
          'Bell signed a 24-month services agreement with a silent auto-renewal clause requiring 90 days notice to opt out. Bell missed the window by six days and was billed for a full renewal term it no longer wanted.',
        issue:
          'Whether a 90-day auto-renewal notice window, buried in a boilerplate term clause, is enforceable against a sophisticated commercial buyer who never separately negotiated it.',
        holding:
          'Enforceable, but only narrowly — the clause was conspicuously formatted and the buyer had counsel review the contract; the court signaled a shorter, negotiated window would likely have been required otherwise.',
        reasoning:
          'The court weighed three things: whether the term was buried or set apart, whether the buyer had a real chance to negotiate it, and whether 90 days exceeds commercial custom (it found market practice clusters at 30–60 days). All three cut close, so it upheld the clause narrowly rather than setting a bright-line rule.',
        footer:
          'The takeaway for §8.2: a 90-day window is defensible, but only barely, negotiating it down to 30 removes the risk entirely.',
      },
    },
    {
      type: 'discoverytracker',
      col: 12,
      id: 'discovery',
      delay: 500,
      props: {
        title: "Meanwhile: Meridian's discovery requests",
        icon: 'doc',
        iconColor: 'var(--presence)',
        requests: [
          {
            num: 1,
            description: 'All communications regarding the Acme MSA renewal terms',
            requestingParty: 'Meridian Systems',
            status: 'produced',
            batesRange: 'ACME-000412–000488',
            dueDate: 'Apr 3, 2026',
          },
          {
            num: 2,
            description: 'Board minutes discussing the 2025 vendor consolidation',
            requestingParty: 'Meridian Systems',
            status: 'objected',
            dueDate: 'Apr 3, 2026',
          },
          {
            num: 3,
            description: "Outside counsel's memo on liability-cap exposure",
            requestingParty: 'Meridian Systems',
            status: 'privileged',
            privilegeBasis: 'attorney-client privilege',
            dueDate: 'Apr 3, 2026',
          },
          {
            num: 4,
            description: 'All Order Forms executed under the MSA since 2024',
            requestingParty: 'Meridian Systems',
            status: 'outstanding',
            dueDate: 'Apr 17, 2026',
          },
          {
            num: 5,
            description: 'Internal escalation emails re: the 90-day notice miss',
            requestingParty: 'Meridian Systems',
            status: 'outstanding',
            dueDate: 'Apr 17, 2026',
          },
        ],
        footer:
          'Same file, a different matter — Meridian is compelling production on the renewal dispute. Two requests are still open with two weeks left on the clock.',
      },
    },
    {
      type: 'patentclaimchart',
      col: 12,
      delay: 500,
      props: {
        title: "One more diligence check: Acme's sync engine against a live patent",
        icon: 'table',
        iconColor: 'var(--presence)',
        claimElements: [
          {
            id: '1.1',
            text: 'receiving, at a server, a stream of shipment-location updates from a plurality of mobile devices',
          },
          {
            id: '1.2',
            text: 'storing each location update in a distributed ledger replicated across at least three nodes',
          },
          {
            id: '1.3',
            text: 'detecting a conflict between two location updates for the same shipment received within a threshold time window',
          },
          {
            id: '1.4',
            text: 'automatically resolving the conflict using a timestamp-priority rule without human intervention',
          },
          {
            id: '1.5',
            text: 'pushing the resolved location to a customer-facing dashboard in real time',
          },
        ],
        references: ["Acme's platform (accused)", 'US 9,112,233 (prior art)'],
        cells: [
          [
            {
              state: 'disclosed',
              quote: 'Edge devices stream GPS pings to the ingest cluster every 4 seconds.',
            },
            {
              state: 'disclosed',
              quote: 'Sensor readings are logged to a central event bus polled by field units.',
            },
          ],
          [
            {
              state: 'disclosed',
              quote: 'Every update is written to a 3-node Raft-replicated ledger before ack.',
            },
            {
              state: 'disclosed',
              quote: 'Readings are mirrored to a backup store for durability.',
            },
          ],
          [
            {
              state: 'disputed',
              quote:
                'Acme’s docs describe "duplicate suppression," which may or may not be the claimed conflict detection — worth a follow-up question.',
            },
            { state: 'not-disclosed' },
          ],
          [{ state: 'not-disclosed' }, { state: 'not-disclosed' }],
          [
            {
              state: 'disclosed',
              quote: 'Resolved coordinates post to the live tracking map within 400ms.',
            },
            { state: 'not-disclosed' },
          ],
        ],
        footer:
          "Acme's platform is missing element 1.4 — conflicts get flagged for manual review, not auto-resolved — so it doesn't literally practice the claim; no license carve-out needed to sign. Same gap means this reference doesn't invalidate the patent either, so revisit if Acme ever ships auto-resolution.",
      },
    },
    {
      type: 'litigationtimeline',
      col: 7,
      delay: 500,
      props: {
        title: 'If the renewal dispute escalates',
        icon: 'proof',
        iconColor: 'var(--presence)',
        events: [
          {
            date: '2026-08-03',
            kind: 'filing',
            court: 'D. Del.',
            party: 'Plaintiff',
            urgency: 'routine',
            detail: 'Complaint for breach of contract, if the 90-day notice window gets missed.',
          },
          {
            date: '2026-08-24',
            kind: 'motion',
            court: 'D. Del.',
            party: 'Defendant',
            urgency: 'soon',
            detail: 'Motion to dismiss, citing Bell v. Meridian on the notice-window question.',
          },
          {
            date: '2026-09-14',
            kind: 'hearing',
            court: 'D. Del.',
            urgency: 'soon',
            detail: 'Oral argument on the motion to dismiss.',
          },
          {
            date: '2026-09-28',
            kind: 'deadline',
            urgency: 'critical',
            detail:
              'Last day to file non-renewal notice before the term silently rolls another year.',
          },
          {
            date: '2026-10-19',
            kind: 'order',
            court: 'D. Del.',
            urgency: 'routine',
            detail: 'Ruling expected on the motion to dismiss.',
          },
        ],
        footer: 'The track record Bell v. Meridian sets, worth avoiding by redlining §8.2 now.',
      },
    },
    {
      type: 'billtracker',
      col: 5,
      delay: 580,
      props: {
        title: 'The bill that could reshape this MSA',
        icon: 'chart',
        iconColor: 'var(--insight)',
        bill: 'S. 1189 — Data Broker Registration Act',
        stages: [
          { name: 'Introduced', status: 'done' },
          { name: 'Committee', status: 'done', voteTally: { yea: 14, nay: 6 } },
          { name: 'Floor Vote', status: 'done', voteTally: { yea: 62, nay: 38 } },
          { name: 'Other Chamber', status: 'current' },
          { name: 'Signed', status: 'pending' },
        ],
        footer:
          'If it passes, data processors like Acme pick up new registration duties, worth its own clause in the next redline.',
      },
    },
    {
      type: 'immigrationcase',
      col: 12,
      delay: 660,
      props: {
        title: 'Case status — employment-based petition',
        icon: 'globe',
        iconColor: 'var(--presence)',
        visaCategory: 'EB-2 · I-140 Immigrant Petition',
        priorityDate: 'Mar 15, 2024',
        rfeDeadline: '2026-07-20',
        stages: [
          { name: 'I-140 filed', status: 'done', date: 'Mar 15, 2024' },
          { name: 'Biometrics', status: 'done', date: 'May 2, 2024' },
          { name: 'Request for Evidence issued', status: 'current', date: 'Jun 10, 2026' },
          { name: 'Decision', status: 'pending' },
        ],
        footer:
          'The RFE asks for updated proof of the employer’s ability to pay, gather the last two years of tax returns before the deadline.',
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'docs',
  intents: {
    risk: {
      kind: 'spotlight',
      spotId: 'risk',
      say: 'The whole risk is one clause, the auto-renewal with a 90-day notice window.',
    },
    clause: {
      kind: 'spotlight',
      spotId: 'clause',
      say: 'Here it is in the document, §8.2 lit up, everything else dimmed.',
    },
  },
  tryChip: { label: 'Review this contract before I sign', route: 'topic:legal' },
  suggests: [
    { label: 'Show me the risky clause', icon: 'doc', route: 'topic:legal', lead: 'Try' },
    { label: 'How does it compare to market?', icon: 'table', route: 'topic:legal' },
    { label: 'Prep my Q1 board docs', icon: 'slides', route: 'topic:revenue' },
    { label: 'Two offers, side by side', icon: 'table', route: 'topic:offers' },
  ],
  keywords: [
    {
      test: /\bcontract\b|\bclause\b|\bmsa\b|\bnda\b|auto.?renew|indemnif|liability cap|before (i|you) sign|the agreement\b|redline/,
      route: 'topic:legal',
    },
  ],
};
