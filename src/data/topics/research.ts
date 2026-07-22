// research.ts, "Did GLP-1 drugs cure the obesity epidemic?" A research deep-dive that
// shows its work: how Mavéa reasoned (reasoning/agenttrace/routing/toolcalls), what it
// retrieved + embedded (retrieval/embedmap/tokenstream), how models differed
// (modelcompare/whatchanged), and how it PROVED the claims with evidence
// (citationchain/factcheck/confidencemeter/sourcelist/claimgrid/annotateddoc/redline/
// highlightsnippet/docoutline/hypothesiscard), plus a citation network and a spend sunburst.
// 21 showcase components from ai / docs / charts1.
import type { ConversationSpec } from '../conversation';

export const research: ConversationSpec = {
  id: 'research',
  workspace: 'Research desk',
  title: 'Are GLP-1 drugs bending the obesity curve?',
  sub: 'Eleven trials, two guideline bodies, and the payer data, read, weighed, and proven.',
  opener:
    "Short answer: the weight loss is real and large, but the population-level dent is still early. Here's how I got there, and the receipts.",
  switchSay: "Let's open the GLP-1 research.",
  gather: 'Reading 38 sources · ranking evidence',
  found: "I read 38 sources, kept 11, and proved the load-bearing claims. Here's the shape of it.",
  tint: '#7c9cff',
  context: [
    { name: 'PubMed · 38 hits', color: 'var(--insight)' },
    { name: 'SELECT trial.pdf', color: 'var(--presence-soft)' },
    { name: 'Payer claims.csv', color: 'var(--presence)' },
    { name: 'AHA + NICE guidance', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative: two insight blocks ──
    {
      type: 'insight',
      col: 8,
      id: 'efficacy',
      num: '1',
      delay: 0,
      props: {
        title: 'In trials, semaglutide drops body weight ~15% over 68 weeks',
        stat: '−14.9%',
        delta: 'vs −2.4% placebo',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'STEP 1 (n=1,961) is the anchor; tirzepatide hit −20.9% in SURMOUNT-1. The efficacy signal is consistent and large across every Phase 3 readout.',
        sources: [{ file: 'STEP 1 · NEJM 2021', loc: 'Table 2' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'population',
      num: '2',
      delay: 80,
      props: {
        title: 'Population-level obesity rate has barely moved, yet',
        stat: '−0.3pt',
        delta: 'too early to attribute',
        deltaDir: 'down',
        conf: 'inferred',
        summary:
          'Only ~2% of eligible US adults are on therapy; adherence falls to ~33% at one year. The curve bends slowly.',
        sources: [{ file: 'Payer claims.csv', loc: 'persistence' }],
      },
    },

    // ════════ HOW MAVÉA REASONED (ai family) ════════
    {
      type: 'reasoning',
      col: 8,
      delay: 160,
      id: 'plan',
      props: {
        title: 'How I worked the question',
        icon: 'spark',
        iconColor: 'var(--insight)',
        steps: [
          {
            label: 'Decompose',
            summary: 'Split into efficacy, durability, safety, and population impact.',
            detail:
              'Each sub-question needs a <b>different evidence bar</b>, RCTs for efficacy, real-world claims data for population effect.',
            tag: 'frame',
            tagColor: 'var(--insight)',
          },
          {
            label: 'Source',
            summary: 'Prioritize Phase 3 RCTs and guideline bodies over press coverage.',
            detail:
              'Ranked 38 candidates by study design, sample size, and recency; demoted anything secondary.',
            tag: 'rank',
            tagColor: 'var(--presence-soft)',
          },
          {
            label: 'Cross-check',
            summary: 'Require two independent sources before stating a number as fact.',
            detail:
              'A single trial sets a hypothesis; a <mark>replication or meta-analysis</mark> promotes it to a claim.',
            tag: 'verify',
            tagColor: 'var(--presence)',
          },
          {
            label: 'Caveat',
            summary: 'Separate trial-population results from real-world adherence.',
            tag: 'temper',
            tagColor: 'var(--warning)',
          },
        ],
        conclusion:
          'Efficacy is <b>strongly</b> supported; population impact is <b>plausible but unproven</b> until persistence improves.',
        footer: 'Reasoning is shown so you can audit the chain, not just the answer.',
      },
    },
    {
      type: 'routing',
      col: 4,
      delay: 240,
      props: {
        title: 'Where I routed the question',
        icon: 'share',
        iconColor: 'var(--presence-soft)',
        query: 'did GLP-1 drugs cure obesity?',
        classifier: 'intent · medical-evidence',
        choices: [
          {
            label: 'Evidence synthesis',
            sub: 'RCTs + meta-analyses',
            score: 0.91,
            taken: true,
            reason: 'Asks a <b>causal medical claim</b>, needs graded trial evidence, not opinion.',
            color: 'var(--insight)',
          },
          {
            label: 'News summary',
            sub: 'recent coverage',
            score: 0.38,
            reason: 'Too shallow for a causal claim.',
            color: 'var(--text-muted)',
          },
          {
            label: 'Market analysis',
            sub: 'Lilly / Novo revenue',
            score: 0.21,
            color: 'var(--text-muted)',
          },
        ],
        footer: 'High-stakes health queries route to the evidence pipeline by default.',
      },
    },
    {
      type: 'agenttrace',
      col: 12,
      delay: 320,
      id: 'trace',
      props: {
        title: "The search agent's decisions",
        icon: 'layers',
        iconColor: 'var(--insight)',
        nodes: [
          {
            step: '01',
            decision: 'Which databases to query first?',
            branches: [
              {
                label: 'PubMed + Cochrane',
                note: 'Peer-reviewed, gradeable',
                chosen: true,
                score: 0.94,
                color: 'var(--insight)',
              },
              {
                label: 'Open web',
                note: 'Fast but noisy',
                score: 0.42,
                color: 'var(--text-muted)',
              },
            ],
          },
          {
            step: '02',
            decision: 'How to handle conflicting weight-loss numbers?',
            branches: [
              {
                label: 'Anchor on largest RCT',
                note: 'STEP 1, n=1,961',
                chosen: true,
                score: 0.88,
                color: 'var(--presence)',
              },
              {
                label: 'Average all studies',
                note: 'Mixes drugs + doses',
                score: 0.31,
                color: 'var(--text-muted)',
              },
            ],
          },
          {
            step: '03',
            decision: 'Can I claim a population-level cure?',
            branches: [
              {
                label: 'No, flag as premature',
                note: 'Adherence + access gaps',
                chosen: true,
                score: 0.86,
                color: 'var(--warning)',
              },
              {
                label: 'Yes, trials are decisive',
                note: 'Conflates efficacy with reach',
                score: 0.19,
                color: 'var(--danger)',
              },
            ],
          },
        ],
        footer: 'Each fork shows the path taken and the value of the road not travelled.',
      },
    },
    {
      type: 'toolcalls',
      col: 7,
      delay: 400,
      props: {
        title: 'Tools I called',
        icon: 'globe',
        iconColor: 'var(--presence)',
        calls: [
          {
            name: 'pubmed.search',
            verb: 'GET',
            request: '{ q: "semaglutide weight loss RCT", years: "2021-2026" }',
            response: '38 results · 11 Phase 3 trials',
            status: 'ok',
            ms: 412,
          },
          {
            name: 'fetch.pdf',
            verb: 'GET',
            request: '{ url: "nejm.org/STEP1", pages: "1-12" }',
            response: 'parsed 11 pages · Table 2 extracted',
            status: 'ok',
            ms: 1840,
          },
          {
            name: 'claims.query',
            verb: 'POST',
            request: '{ cohort: "GLP1_2024", metric: "persistence_12mo" }',
            response: '{ persistence: 0.331, n: 24117 }',
            status: 'ok',
            ms: 690,
          },
          {
            name: 'fetch.pdf',
            verb: 'GET',
            request: '{ url: "fda.gov/wegovy-label" }',
            response: 'timeout, retried via cache',
            status: 'error',
            ms: 5001,
          },
        ],
        footer: 'Four calls, one retried, the cached label still resolved.',
      },
    },
    {
      type: 'retrieval',
      col: 5,
      delay: 480,
      props: {
        title: 'Top retrieved chunks',
        icon: 'doc',
        iconColor: 'var(--insight)',
        query: 'mean percent body-weight change at 68 weeks',
        chunks: [
          {
            source: 'STEP 1 · NEJM',
            score: 0.94,
            snippet: 'Mean change in body weight was −14.9% with semaglutide.',
            tag: 'anchor',
            tagColor: 'var(--insight)',
            used: true,
            body: 'Participants in the <mark>semaglutide group</mark> lost a mean of 14.9% of body weight vs 2.4% with placebo (p<0.001).',
          },
          {
            source: 'SURMOUNT-1 · NEJM',
            score: 0.91,
            snippet: 'Tirzepatide 15 mg produced −20.9% at 72 weeks.',
            tag: 'support',
            tagColor: 'var(--presence)',
            used: true,
          },
          {
            source: 'SELECT · NEJM',
            score: 0.87,
            snippet: '20% relative reduction in MACE in cardiovascular patients.',
            tag: 'outcomes',
            tagColor: 'var(--presence-soft)',
            used: true,
          },
          {
            source: 'Health blog',
            score: 0.41,
            snippet: '"I lost 30 pounds", anecdote, not graded',
            tag: 'dropped',
            tagColor: 'var(--text-muted)',
            used: false,
          },
        ],
        footer: 'Re-ranked by cosine score; the anecdote scored low and was dropped.',
      },
    },
    {
      type: 'embedmap',
      col: 7,
      delay: 560,
      props: {
        title: 'The evidence, embedded',
        icon: 'layers',
        iconColor: 'var(--presence-soft)',
        clusters: [
          { name: 'Efficacy RCTs', color: 'var(--insight)' },
          { name: 'Safety / side-effects', color: 'var(--warning)' },
          { name: 'Real-world adherence', color: 'var(--presence)' },
          { name: 'Off-topic / weak', color: 'var(--text-muted)' },
        ],
        points: [
          { x: 0.22, y: 0.3, label: 'STEP 1', cluster: 0 },
          { x: 0.28, y: 0.24, label: 'STEP 4', cluster: 0 },
          { x: 0.18, y: 0.38, label: 'SURMOUNT-1', cluster: 0 },
          { x: 0.31, y: 0.34, label: 'the question', cluster: 0, query: true },
          { x: 0.7, y: 0.28, label: 'GI events', cluster: 1 },
          { x: 0.76, y: 0.36, label: 'pancreatitis?', cluster: 1 },
          { x: 0.66, y: 0.72, label: 'Persistence', cluster: 2 },
          { x: 0.74, y: 0.78, label: 'Payer claims', cluster: 2 },
          { x: 0.4, y: 0.82, label: 'price stories', cluster: 3 },
          { x: 0.5, y: 0.88, label: 'celeb anecdote', cluster: 3 },
        ],
        footer: "The question lands inside the efficacy cluster, that's what it's really asking.",
      },
    },
    {
      type: 'tokenstream',
      col: 5,
      delay: 640,
      props: {
        title: 'Drafting the verdict, token by token',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        prefix: 'The evidence shows GLP-1 therapy is ',
        tokens: [
          {
            text: 'highly',
            p: 0.88,
            alts: [
              { t: 'very', p: 0.07 },
              { t: 'broadly', p: 0.03 },
            ],
          },
          { text: ' effective', p: 0.95 },
          { text: ' for', p: 0.91 },
          { text: ' weight', p: 0.97 },
          { text: ' loss', p: 0.98 },
          {
            text: ', but',
            p: 0.62,
            alts: [
              { t: ' though', p: 0.21 },
              { t: '. However', p: 0.11 },
            ],
          },
          { text: ' population', p: 0.71, alts: [{ t: ' real-world', p: 0.22 }] },
          { text: ' impact', p: 0.93 },
          { text: ' remains', p: 0.84 },
          {
            text: ' unproven',
            p: 0.58,
            alts: [
              { t: ' early', p: 0.29 },
              { t: ' limited', p: 0.09 },
            ],
          },
          { text: '.', p: 0.99 },
        ],
        footer:
          'Low-confidence tokens are where the hedging lives, hover to see what I almost said.',
      },
    },
    {
      type: 'modelcompare',
      col: 12,
      delay: 720,
      id: 'models',
      props: {
        title: 'Three models, one prompt',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        prompt: 'Did GLP-1 drugs cure the obesity epidemic? Answer with evidence.',
        outputs: [
          {
            model: 'Mavéa Research',
            badge: 'graded',
            color: 'var(--insight)',
            best: true,
            text: 'No "cure," but a <mark>genuine inflection</mark>: ~15% weight loss in trials, modest population reach so far. Cited 11 RCTs.',
            meta: [
              { k: 'citations', v: '11' },
              { k: 'hallucinations', v: '0' },
              { k: 'hedged', v: 'yes' },
            ],
          },
          {
            model: 'Generic Large',
            badge: 'baseline',
            color: 'var(--text-muted)',
            text: 'GLP-1 drugs have <mark>largely solved</mark> obesity for those who take them, reversing decades of rising rates.',
            meta: [
              { k: 'citations', v: '2' },
              { k: 'hallucinations', v: '1' },
              { k: 'hedged', v: 'no' },
            ],
          },
          {
            model: 'Fast Mini',
            badge: 'cheap',
            color: 'var(--warning)',
            text: 'Yes, semaglutide and tirzepatide are <mark>effective cures</mark> with few downsides.',
            meta: [
              { k: 'citations', v: '0' },
              { k: 'hallucinations', v: '2' },
              { k: 'hedged', v: 'no' },
            ],
          },
        ],
        footer: 'The graded pipeline is the only one that refused the word "cure", and cited why.',
      },
    },
    {
      type: 'whatchanged',
      col: 12,
      delay: 800,
      props: {
        title: 'What changed after I read the payer data',
        icon: 'edit',
        iconColor: 'var(--warning)',
        beforeLabel: 'First draft',
        afterLabel: 'Revised',
        before: 'GLP-1 drugs are reversing the obesity epidemic at population scale.',
        after:
          'GLP-1 drugs work powerfully per-patient, but population impact is gated by adherence and access.',
        diff: [
          {
            t: 'del',
            c: 'GLP-1 drugs are <b>reversing the obesity epidemic at population scale</b>.',
          },
          { t: 'add', c: 'GLP-1 drugs work powerfully <b>per-patient</b>,' },
          { t: 'add', c: 'but population impact is <b>gated by adherence and access</b>.' },
          { t: 'ctx', c: 'Trigger: 12-month persistence in claims data was only 33%.' },
        ],
        footer: 'The real-world number forced a more honest claim, the edit is the work.',
      },
    },

    // ════════ HOW MAVÉA PROVED IT (docs family) ════════
    {
      type: 'factcheck',
      col: 7,
      delay: 880,
      id: 'facts',
      props: {
        title: 'The load-bearing claims, checked',
        icon: 'proof',
        iconColor: 'var(--presence)',
        claims: [
          {
            claim: 'Semaglutide produces ~15% mean weight loss at 68 weeks.',
            verdict: 'true',
            confidence: 96,
            sources: ['nejm.org', 'cochrane.org'],
            detail:
              'STEP 1 reported <mark>−14.9%</mark>; the Cochrane synthesis corroborates within 1pt.',
          },
          {
            claim: 'Tirzepatide outperforms semaglutide on weight loss.',
            verdict: 'partly',
            confidence: 74,
            sources: ['nejm.org', 'jama.com'],
            detail:
              'SURMOUNT-1 (−20.9%) vs STEP 1 (−14.9%), but no head-to-head at matched doses yet.',
          },
          {
            claim: 'GLP-1 drugs have cured the obesity epidemic.',
            verdict: 'false',
            confidence: 91,
            sources: ['cdc.gov', 'claims data'],
            detail:
              'Population obesity prevalence has not meaningfully fallen; reach is ~2% of eligible adults.',
          },
          {
            claim: 'Therapy reduces major cardiovascular events.',
            verdict: 'true',
            confidence: 89,
            sources: ['nejm.org'],
            detail:
              'SELECT showed a <mark>20% relative MACE reduction</mark> in overweight CV patients.',
          },
        ],
        footer: 'Each verdict expands to its sources, green is replicated, amber is single-study.',
      },
    },
    {
      type: 'confidencemeter',
      col: 5,
      delay: 960,
      id: 'conf',
      props: {
        title: 'Confidence in the headline number',
        icon: 'shield',
        iconColor: 'var(--insight)',
        claim: '<b>~15% weight loss</b> at 68 weeks on semaglutide 2.4mg',
        overall: 94,
        segments: [
          {
            label: 'RCT design',
            weight: 38,
            band: 'strong',
            basis: 'Randomized, double-blind, placebo-controlled Phase 3.',
          },
          {
            label: 'Replication',
            weight: 30,
            band: 'strong',
            basis: 'Reproduced across STEP 1–4 and a Cochrane meta-analysis.',
          },
          {
            label: 'Sample size',
            weight: 18,
            band: 'strong',
            basis: 'n=1,961 in the anchor trial alone.',
          },
          {
            label: 'Generalizability',
            weight: 14,
            band: 'partial',
            basis: 'Trial adherence far exceeds real-world persistence.',
          },
        ],
        footer: 'The only soft segment is generalizing trial results to everyday use.',
      },
    },
    {
      type: 'citationchain',
      col: 7,
      delay: 1040,
      id: 'chain',
      props: {
        title: 'Claim → source → sub-evidence',
        icon: 'link',
        iconColor: 'var(--presence-soft)',
        root: {
          label: '<b>Semaglutide drives ~15% weight loss</b> at 68 weeks',
          cite: 'synthesis',
          color: 'var(--insight)',
          strength: 'strong',
          children: [
            {
              label: 'STEP 1 randomized trial',
              cite: 'nejm.org',
              color: 'var(--presence)',
              strength: 'strong',
              children: [
                { label: 'Table 2, mean change −14.9%', cite: 'p. 994', strength: 'strong' },
                { label: 'Pre-registered endpoint', cite: 'NCT03548935', strength: 'strong' },
              ],
            },
            {
              label: 'Cochrane meta-analysis',
              cite: 'cochrane.org',
              color: 'var(--presence-soft)',
              strength: 'strong',
              children: [
                { label: 'Pooled across 11 RCTs', cite: '2024', strength: 'strong' },
                { label: 'Low heterogeneity (I²=22%)', cite: 'forest plot', strength: 'partial' },
              ],
            },
          ],
        },
        footer: 'Every node traces to a primary document, expand to walk the chain.',
      },
    },
    {
      type: 'sourcelist',
      col: 5,
      delay: 1120,
      id: 'sources',
      props: {
        title: 'Sources I kept',
        icon: 'doc',
        iconColor: 'var(--insight)',
        sources: [
          {
            domain: 'nejm.org',
            titleText: 'STEP 1: Once-Weekly Semaglutide in Adults with Overweight',
            relevance: 98,
            glyph: 'N',
            color: 'var(--insight)',
            date: '2021',
            snippet: 'The anchor efficacy RCT, <mark>−14.9%</mark> mean weight change.',
          },
          {
            domain: 'nejm.org',
            titleText: 'SURMOUNT-1: Tirzepatide for Obesity',
            relevance: 95,
            glyph: 'N',
            color: 'var(--insight)',
            date: '2022',
            snippet: '−20.9% at the 15mg dose over 72 weeks.',
          },
          {
            domain: 'nejm.org',
            titleText: 'SELECT: Semaglutide and Cardiovascular Outcomes',
            relevance: 92,
            glyph: 'N',
            color: 'var(--presence)',
            date: '2023',
            snippet: '20% relative reduction in major adverse CV events.',
          },
          {
            domain: 'cochrane.org',
            titleText: 'GLP-1 agonists for weight management (review)',
            relevance: 90,
            glyph: 'C',
            color: 'var(--presence-soft)',
            date: '2024',
          },
          {
            domain: 'cdc.gov',
            titleText: 'Adult Obesity Prevalence Maps',
            relevance: 78,
            glyph: 'C',
            color: 'var(--text-muted)',
            date: '2025',
          },
        ],
        footer: 'Ranked by relevance, three NEJM RCTs carry the efficacy claim.',
      },
    },
    {
      type: 'claimgrid',
      col: 12,
      delay: 1200,
      id: 'grid',
      props: {
        title: 'Claims × evidence, who backs what',
        icon: 'table',
        iconColor: 'var(--presence-soft)',
        columns: ['STEP 1', 'SURMOUNT-1', 'SELECT', 'Cochrane', 'Claims data'],
        rows: [
          {
            claim: '~15% weight loss',
            cells: [
              { state: 'yes', note: '−14.9% primary endpoint' },
              { state: 'yes', note: 'Exceeds it (−20.9%)' },
              { state: 'partial', note: 'Secondary outcome' },
              { state: 'yes', note: 'Pooled confirmation' },
              { state: 'na' },
            ],
          },
          {
            claim: 'Cardiovascular benefit',
            cells: [
              { state: 'na' },
              { state: 'na' },
              { state: 'yes', note: '−20% MACE' },
              { state: 'partial', note: 'Noted, not pooled' },
              { state: 'na' },
            ],
          },
          {
            claim: 'Durable in real life',
            cells: [
              { state: 'partial', note: 'Only to 68 weeks' },
              { state: 'partial' },
              { state: 'na' },
              { state: 'no', note: 'Trials ≠ adherence' },
              { state: 'no', note: '33% persist at 1yr' },
            ],
          },
          {
            claim: 'Cured obesity epidemic',
            cells: [
              { state: 'no' },
              { state: 'no' },
              { state: 'no' },
              { state: 'no' },
              { state: 'no', note: 'Prevalence flat' },
            ],
          },
        ],
        footer: 'The bottom row is empty of green, which is exactly the headline.',
      },
    },
    {
      type: 'highlightsnippet',
      col: 6,
      delay: 1280,
      props: {
        title: 'The sentence everything hangs on',
        icon: 'quote',
        iconColor: 'var(--insight)',
        quote:
          'The mean change in body weight from baseline to week 68 was −14.9% in the semaglutide group, as compared with −2.4% in the placebo group.',
        phrase: '−14.9% in the semaglutide group',
        source: 'NEJM · STEP 1',
        locator: 'p. 994',
        color: 'var(--insight)',
        footer: 'Pulled verbatim, this is the primary endpoint, not a press summary.',
      },
    },
    {
      type: 'redline',
      col: 6,
      delay: 1360,
      props: {
        title: "How the abstract's claim was tightened",
        icon: 'edit',
        iconColor: 'var(--warning)',
        docName: 'Draft conclusion · v3 → v4',
        tokens: [
          { text: 'Semaglutide ' },
          { del: 'cures obesity', by: 'AM' },
          { ins: 'produces clinically meaningful weight loss', by: 'AM' },
          { text: ' and ' },
          { del: 'eliminates', by: 'ED' },
          { ins: 'reduces', by: 'ED' },
          { text: ' cardiovascular risk in trial populations.' },
        ],
        footer: '2 deletions · 2 insertions, softening "cure" to "clinically meaningful."',
      },
    },
    {
      type: 'annotateddoc',
      col: 12,
      delay: 1440,
      id: 'annot',
      props: {
        title: 'The trial abstract, annotated',
        icon: 'doc',
        iconColor: 'var(--presence)',
        docName: 'STEP 1 · NEJM 2021 · abstract',
        paragraphs: [
          'In this 68-week, double-blind trial, we randomly assigned 1,961 adults with a body-mass index of 30 or greater to once-weekly semaglutide (2.4 mg) or placebo, plus lifestyle intervention.',
          'The mean change in body weight from baseline to week 68 was −14.9% in the semaglutide group, as compared with −2.4% with placebo. Participants who received semaglutide had greater improvements in cardiometabolic risk factors.',
          'Nausea and diarrhea were the most common adverse events; they were typically transient and mild-to-moderate and subsided over time.',
        ],
        highlights: [
          {
            phrase: '1,961 adults',
            note: 'Large, adequately powered sample for a Phase 3 obesity RCT.',
            color: 'var(--insight)',
            author: 'Sample',
          },
          {
            phrase: '−14.9%',
            note: 'The headline efficacy figure, replicated downstream in STEP 2–4.',
            color: 'var(--presence)',
            author: 'Endpoint',
          },
          {
            phrase: 'Nausea and diarrhea',
            note: 'Real but tolerable, drives much of the early discontinuation.',
            color: 'var(--warning)',
            author: 'Safety',
          },
        ],
        footer: 'Click a highlight to read why it matters to the verdict.',
      },
    },
    {
      type: 'docoutline',
      col: 5,
      delay: 1520,
      props: {
        title: 'How the report is structured',
        icon: 'layers',
        iconColor: 'var(--insight)',
        docName: 'GLP-1 evidence review',
        activeIndex: 1,
        sections: [
          { heading: '1 · The question', loc: 'p.1', weight: 6 },
          {
            heading: '2 · Efficacy evidence',
            loc: 'p.2',
            weight: 40,
            children: [
              { heading: '2.1 Anchor RCT (STEP 1)', loc: 'p.2', weight: 16 },
              { heading: '2.2 Tirzepatide comparison', loc: 'p.4', weight: 14 },
              { heading: '2.3 Meta-analysis', loc: 'p.5', weight: 10 },
            ],
          },
          {
            heading: '3 · Real-world impact',
            loc: 'p.6',
            weight: 28,
            children: [
              { heading: '3.1 Adherence & persistence', loc: 'p.6', weight: 16 },
              { heading: '3.2 Access & cost', loc: 'p.7', weight: 12 },
            ],
          },
          { heading: '4 · Verdict & caveats', loc: 'p.8', weight: 14 },
        ],
        footer: 'The efficacy section carries the most weight, and the strongest evidence.',
      },
    },

    // ════════ THE SHAPE OF THE EVIDENCE (charts1) ════════
    {
      type: 'network',
      col: 7,
      delay: 1600,
      id: 'cites',
      props: {
        title: 'How the trials cite each other',
        icon: 'share',
        iconColor: 'var(--presence-soft)',
        layout: 'circle',
        nodes: [
          { id: 'step1', label: 'STEP 1', group: 0, weight: 9, color: 'var(--insight)' },
          { id: 'step2', label: 'STEP 2', group: 0, weight: 6, color: 'var(--insight)' },
          { id: 'step4', label: 'STEP 4', group: 0, weight: 5, color: 'var(--insight)' },
          { id: 'surmount', label: 'SURMOUNT-1', group: 1, weight: 7, color: 'var(--presence)' },
          { id: 'select', label: 'SELECT', group: 2, weight: 8, color: 'var(--presence-soft)' },
          { id: 'cochrane', label: 'Cochrane', group: 3, weight: 9, color: 'var(--warning)' },
        ],
        edges: [
          { source: 'cochrane', target: 'step1', weight: 3 },
          { source: 'cochrane', target: 'step2', weight: 2 },
          { source: 'cochrane', target: 'step4', weight: 2 },
          { source: 'cochrane', target: 'surmount', weight: 2 },
          { source: 'surmount', target: 'step1', weight: 2 },
          { source: 'select', target: 'step1', weight: 1 },
          { source: 'step2', target: 'step1', weight: 1 },
          { source: 'step4', target: 'step1', weight: 1 },
        ],
        footer: 'STEP 1 and the Cochrane review are the hubs, everything leans on them.',
      },
    },
    {
      type: 'sunburst',
      col: 5,
      delay: 1680,
      props: {
        title: 'Where the research time went',
        icon: 'chart',
        iconColor: 'var(--insight)',
        unit: 'min',
        root: {
          label: 'Research',
          value: 100,
          children: [
            {
              label: 'Reading',
              value: 52,
              color: 'var(--insight)',
              children: [
                { label: 'RCTs', value: 30 },
                { label: 'Meta-analyses', value: 14 },
                { label: 'Guidelines', value: 8 },
              ],
            },
            {
              label: 'Verifying',
              value: 30,
              color: 'var(--presence)',
              children: [
                { label: 'Cross-check', value: 18 },
                { label: 'Claims data', value: 12 },
              ],
            },
            {
              label: 'Writing',
              value: 18,
              color: 'var(--presence-soft)',
              children: [
                { label: 'Synthesis', value: 12 },
                { label: 'Caveats', value: 6 },
              ],
            },
          ],
        },
        footer: 'More than half the time was reading, and nearly a third was checking.',
      },
    },
    {
      type: 'researchsummary',
      col: 9,
      delay: 1760,
      props: {
        title: 'GLP-1 agonists, evidence summary',
        question:
          'Are GLP-1 receptor agonists effective and safe for long-term weight management in adults with obesity?',
        method: 'Cochrane systematic review + meta-analysis of 14 RCTs',
        sampleSize: '~18,000 participants, follow-up 52–208 weeks',
        year: '2023',
        findings: [
          'Semaglutide 2.4 mg achieved mean body-weight reduction of 12–15% vs 2–3% for placebo.',
          'All GLP-1 agonists outperformed placebo on the primary weight outcome (high certainty).',
          'Cardiovascular event rates fell significantly in high-risk populations (SELECT trial).',
          'Gastrointestinal side-effects (nausea, vomiting) are common but typically transient.',
        ],
        conclusion:
          'GLP-1 agonists are the most effective pharmacotherapy for obesity currently available. Long-term benefit requires continuous use, discontinuation leads to weight regain within one year.',
        limitations:
          'Most trials exclude people with prior GI surgery; long-term safety beyond 5 years is not yet established.',
        source: 'Iepsen et al. · Cochrane Database Syst Rev · 2023',
      },
    },
    {
      type: 'hypothesiscard',
      col: 6,
      delay: 1840,
      props: {
        title: 'SELECT trial, primary hypothesis',
        icon: 'proof',
        iconColor: 'var(--presence)',
        h0: 'Semaglutide 2.4 mg does not reduce the rate of major adverse cardiovascular events (MACE) versus placebo in adults with overweight or obesity and established cardiovascular disease, without diabetes.',
        h1: 'Semaglutide 2.4 mg reduces the rate of MACE versus placebo in this population.',
        direction: 'two-tailed',
        alpha: 0.05,
        variables: {
          iv: 'Treatment arm, semaglutide 2.4 mg vs placebo',
          dv: 'Time to first MACE (CV death, non-fatal MI, non-fatal stroke)',
        },
        rejected: true,
        footer:
          'HR 0.80 (95% CI 0.72&ndash;0.90), p &lt; 0.001 &mdash; a highly significant reduction in MACE.',
      },
    },
    {
      type: 'dotplot',
      col: 6,
      delay: 1920,
      props: {
        title: 'Weight Loss Distribution, STEP 1 Trial',
        values: [3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24],
        label: '% body weight lost at 68 weeks',
        color: 'var(--presence)',
        note: 'Most participants lost 10–16%; the long right tail shows a subgroup exceeding 20%.',
      },
    },
    {
      type: 'controlchart',
      col: 6,
      delay: 2000,
      props: {
        title: 'Adherence Rate, 8-Week Titration',
        yLabel: '% on therapy',
        centerLine: 82,
        ucl: 92,
        lcl: 72,
        points: [
          { label: 'W1', value: 98 },
          { label: 'W2', value: 94 },
          { label: 'W3', value: 88 },
          { label: 'W4', value: 84 },
          { label: 'W5', value: 79 },
          { label: 'W6', value: 75, outOfControl: true },
          { label: 'W7', value: 80 },
          { label: 'W8', value: 83 },
        ],
        note: 'Week 6 dipped below the lower control limit, GI side-effects drove early discontinuation.',
      },
    },
    {
      type: 'errorbars',
      col: 6,
      delay: 2080,
      props: {
        title: 'HbA1c Reduction by Semaglutide Dose (SUSTAIN-7)',
        yLabel: 'HbA1c change (%)',
        unit: '%',
        groups: [
          { label: 'Placebo', mean: -0.1, ci: 0.12, color: 'var(--text-muted)' },
          { label: '0.5 mg', mean: -1.5, ci: 0.13, color: 'var(--insight)' },
          { label: '1.0 mg', mean: -1.8, ci: 0.13, color: 'var(--presence)' },
        ],
        reference: { value: 0, label: 'no change' },
        bracket: { from: 0, to: 2, label: 'p < 0.0001' },
        footer:
          'Both doses cut HbA1c far more than placebo, and the two confidence intervals barely overlap &mdash; the 1.0&nbsp;mg arm is reliably stronger than 0.5&nbsp;mg.',
      },
    },
  ],

  proof: {
    spotId: 'population',
    say: "Here's why I won't say 'cured': the real-world persistence data.",
    claim: 'Population impact is gated by adherence, only ~33% persist at 12 months',
    conf: 'strong',
    file: { label: 'Payer claims.csv', type: 'csv', loc: 'persistence cohort' },
    rows: [
      { a: 'On therapy at 1 month', b: '24,117 patients', c: '100%' },
      { a: 'Persisting at 3 months', b: '17,360', c: '72%' },
      { a: 'Persisting at 6 months', b: '12,300', c: '51%' },
      { a: 'Persisting at 12 months', b: '7,983', c: '33%', hot: true },
      { a: 'Eligible adults on any therapy', b: '~2% of eligible', c: 'reach', hot: true },
    ],
    note: 'Only <mark>33%</mark> of patients are still on therapy at one year, and just <mark>~2%</mark> of eligible adults ever start. Trial efficacy is real; population reach is the bottleneck.',
    assumptions: [
      'Persistence = an active fill within 60 days of the expected refill.',
      'Eligibility approximated from BMI ≥30 prevalence in the claims population.',
    ],
  },

  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the brief',
      say: "Here's a one-slide research brief.",
      props: {
        kicker: 'RESEARCH BRIEF · GLP-1 & OBESITY',
        head: 'Powerful per-patient, not yet a population cure',
        foot: 'Made by Mavéa · 11 RCTs + payer claims',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>~15% weight loss</b> at 68 weeks (STEP 1), replicated across 11 trials.',
          },
          {
            color: 'var(--presence)',
            text: '<b>20% fewer cardiac events</b> (SELECT), benefit beyond the scale.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Only 33% persist at 1 year</b> and ~2% of eligible adults start, reach, not efficacy, is the gap.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll compile the 11 kept sources into a bibliography.",
      props: {
        eyebrow: 'Action · bibliography',
        icon: 'doc',
        title: 'Compile the 11 graded sources into a bibliography',
        lines: [
          { k: 'Compiles', v: '11 sources · 3 NEJM RCTs' },
          { k: 'Where', v: 'Right here, export as PDF to keep it' },
        ],
        perm: 'Mavéa has no library connection, it only compiles the citations here.',
        cta: 'Compile the bibliography',
        doneText: 'Bibliography compiled — export as PDF',
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: "Here's a 20-second walkthrough of how I proved it.",
      props: {
        line: '“I asked if GLP-1 drugs cured obesity. Mavéa read 11 trials, showed its reasoning, and proved why the answer is ‘not yet’, in 20 seconds.”',
      },
    },
  },

  group: 'learn',
  tryChip: { label: 'Did GLP-1 drugs cure obesity?', route: 'topic:research' },
  suggests: [
    {
      label: 'Prove the population claim',
      icon: 'proof',
      route: 'research:population',
      lead: 'Try',
    },
    { label: 'Make it a research brief', icon: 'slides', route: 'slide' },
    { label: 'Compile the 11 sources', icon: 'doc', route: 'send' },
    { label: 'Clip a 20-second walkthrough', icon: 'play', route: 'replay' },
    { label: "How's the business doing?", icon: 'chart', route: 'topic:biz' },
  ],
  intents: {
    population: { kind: 'proof' },
    plan: { kind: 'spotlight', spotId: 'plan', say: "Here's the chain I reasoned through." },
    models: {
      kind: 'spotlight',
      spotId: 'models',
      say: "And here's how three models answered the same prompt.",
    },
  },
  keywords: [
    {
      test: /glp.?1|semaglutide|tirzepatide|ozempic|wegovy|obesity|research (this|that|it)|literature review|the evidence (for|on)|systematic review/,
      route: 'topic:research',
      sub: [
        {
          test: /prove|persistence|adherence|population|real.?world|why not/,
          route: 'research:population',
        },
      ],
    },
  ],
};
