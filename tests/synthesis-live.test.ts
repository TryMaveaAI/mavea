import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapCorpus } from '../src/live/prism/synthesis/mapCorpus';
import { isClaimGrounded } from '../src/live/prism/grounding';
import type { Attachment } from '../src/live/attachments';

// LIVE end-to-end: runs the real corpus pipeline against Gemini on real fetched documents. Gated on
// GEMINI_API_KEY + CORPUS_DIR so it never runs in the normal suite (costs a few calls, needs network).
// Its job is to prove the pipeline works on real, messy input and to print what it produced so a human
// can judge quality. Exactly 1 + ⌈N/12⌉ + 1 model calls.
const KEY = process.env.GEMINI_API_KEY;
const DIR = process.env.CORPUS_DIR;

describe.skipIf(!KEY || !DIR)('Synthesis World — LIVE gemini-3.1-flash-lite on real docs', () => {
  it('synthesizes a real corpus, fully grounded', async () => {
    const files = readdirSync(DIR!)
      .filter((f) => f.endsWith('.txt'))
      .sort();
    const sources: Attachment[] = files.map((f) => {
      const buf = readFileSync(join(DIR!, f));
      return { name: f, mime: 'text/plain', data: buf.toString('base64'), size: buf.length };
    });

    const res = await mapCorpus(sources, {
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
      apiKey: KEY,
      // The app calls Gemini through the same-origin /llm/gemini dev proxy (which injects the key). A
      // Node harness has no proxy, so point baseUrl straight at Google and let keyHeader send the key.
      baseUrl: 'https://generativelanguage.googleapis.com',
    });

    const lines: string[] = [];
    const log = (...a: unknown[]): void => {
      lines.push(a.join(' '));
    };
    log('\n════════ LIVE SYNTHESIS RESULT ════════');
    log(
      `sources in: ${sources.length} | model calls: ${res.callCount} | error: ${res.error ?? 'none'}`,
    );
    if (res.debug)
      log(
        `debug: facets=${res.debug.facetCount} · candidatePairs=${res.debug.candidatePairs} · rawAgreements=${res.debug.agreements} · claimsBySource=[${res.debug.claimsBySource.join(',')}]`,
      );
    const s = res.spec;
    if (s) {
      log(`kept ${s.sources.length} sources, ${s.pageCount} pages`);
      log(
        `themes: ${s.themes.map((t) => `${t.name}[${t.sourceCount}src/${t.claimCount}cl]`).join(' · ')}`,
      );
      log(`claims: ${s.claims.length} | counts: ${JSON.stringify(s.counts)}`);
      log('── CONTRADICTIONS ──');
      for (const x of s.contradictions)
        log(
          `  [${x.relation}${x.comparable ? '' : '/not-comparable'}${x.caveat ? ` ·${x.caveat}` : ''}] ${x.label}${x.delta ? ` (${x.delta.aValue} vs ${x.delta.bValue} ${x.delta.unit})` : ''}`,
        );
      log('── GAPS ──');
      for (const g of s.gaps)
        log(
          `  ${g.label}  (${g.coveredCount}/${g.sourcesScanned})  forms: ${g.searchedForms.join(', ')}`,
        );
      log('── CONSENSUS ──');
      for (const c of s.consensus) log(`  ${c.sourceCount}/${c.corpusSize}: ${c.proposition}`);
      log('── sample claims (verbatim quotes) ──');
      for (const c of s.claims.slice(0, 6))
        log(`  ${c.region} · ${s.sources[c.source].label} p.${c.page}: "${c.quote.slice(0, 80)}"`);
      log('═══════════════════════════════════════\n');

      // HARD guarantee: every claim's quote is verbatim on its cited source page.
      const corpus = res.corpus!;
      const ungrounded = s.claims.filter((c) => !isClaimGrounded(c, corpus[c.source]));
      if (ungrounded.length)
        log(
          'UNGROUNDED:',
          ungrounded.map((c) => `${c.id}:"${c.quote.slice(0, 40)}"`),
        );
      log(`ungrounded claims (must be 0): ${ungrounded.length}`);
      writeFileSync(process.env.RESULT_FILE ?? '/tmp/synth-live-result.txt', lines.join('\n'));
      expect(ungrounded.length).toBe(0);
      expect(s.claims.length).toBeGreaterThan(5);
      expect(s.themes.length).toBeGreaterThanOrEqual(2);
    } else {
      writeFileSync(process.env.RESULT_FILE ?? '/tmp/synth-live-result.txt', lines.join('\n'));
    }
    expect(res.spec).not.toBeNull();
  }, 240_000);
});
