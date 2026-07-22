// mindshape-extract.test.ts — unit tests for localExtract.
// Pure, no network: asserts that heuristic patterns fire on expected inputs.
import { describe, it, expect } from 'vitest';
import {
  completeWordsOnly,
  countThoughts,
  localExtract,
  looksLikeThinkingAloud,
} from '../src/live/mindshape/localExtract';

describe('completeWordsOnly — guards the in-progress trailing word of an interim transcript', () => {
  it('drops the half-heard trailing word so "Ind" never reaches the live tagging', () => {
    expect(completeWordsOnly('tell me about Ind')).toBe('tell me about');
  });
  it('also drops a trailing word with no boundary yet (it may still be growing)', () => {
    expect(completeWordsOnly('tell me about India')).toBe('tell me about');
  });
  it('keeps everything once the word lands on a boundary (space or punctuation)', () => {
    expect(completeWordsOnly('tell me about India ')).toBe('tell me about India');
    expect(completeWordsOnly('tell me about India.')).toBe('tell me about India.');
    // the comma boundary means "India," has landed; the next word "and" is still in progress → dropped
    expect(completeWordsOnly('tell me about India, and')).toBe('tell me about India,');
  });
  it('returns empty when nothing has fully landed yet', () => {
    expect(completeWordsOnly('India')).toBe('');
    expect(completeWordsOnly('')).toBe('');
    expect(completeWordsOnly('   ')).toBe('');
  });
});

describe('localExtract', () => {
  it('detects a relationship-word person ("my dad")', () => {
    const atoms = localExtract("i don't know my dad is getting older and i feel guilty");
    const people = atoms.filter((a) => a.kind === 'person');
    expect(people.length).toBeGreaterThanOrEqual(1);
    expect(people[0].label.toLowerCase()).toContain('dad');
  });

  it('detects a named person via proper noun + action verb', () => {
    const atoms = localExtract('Maya just started her new school and she finally has friends');
    const people = atoms.filter((a) => a.kind === 'person');
    expect(people.some((p) => p.label === 'Maya')).toBe(true);
  });

  it('detects family title used as proper name ("Dad\'s not…")', () => {
    const atoms = localExtract(
      "Dad's not getting any younger and i'd be further from him if i take the job",
    );
    const people = atoms.filter((a) => a.kind === 'person');
    expect(people.some((p) => p.label === 'Dad')).toBe(true);
  });

  it('detects a fear ("scared of staying still")', () => {
    const atoms = localExtract("honestly i think i'm just scared of staying still");
    const fears = atoms.filter((a) => a.kind === 'fear');
    expect(fears.length).toBeGreaterThanOrEqual(1);
    expect(fears[0].quote).toContain('scared');
  });

  it('detects a fear with "worried" marker', () => {
    const atoms = localExtract("i'm worried that once i leave i won't be able to get back in");
    const fears = atoms.filter((a) => a.kind === 'fear');
    expect(fears.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a constraint ("my lease is up in March")', () => {
    const atoms = localExtract('my lease is up in March anyway and i have no choice');
    const constraints = atoms.filter((a) => a.kind === 'constraint');
    expect(constraints.length).toBeGreaterThanOrEqual(1);
    expect(constraints[0].quote).toContain('lease');
  });

  it('detects a constraint via "can\'t"', () => {
    const atoms = localExtract("i can't afford to take a risk right now with the mortgage");
    const constraints = atoms.filter((a) => a.kind === 'constraint');
    expect(constraints.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an open loop via "i don\'t know"', () => {
    const atoms = localExtract("i don't know is it even the right time or am i just running");
    const loops = atoms.filter((a) => a.kind === 'open_loop');
    expect(loops.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an open loop from a question mark', () => {
    const atoms = localExtract('what do i actually want from my career?');
    const loops = atoms.filter((a) => a.kind === 'open_loop');
    expect(loops.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an option via "offer"', () => {
    const atoms = localExtract("so there's this offer in Seattle it's more money a lot more");
    const options = atoms.filter((a) => a.kind === 'option');
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a want ("i want to feel settled")', () => {
    const atoms = localExtract("i want to feel settled i've always wanted that sense of stability");
    const wants = atoms.filter((a) => a.kind === 'want');
    expect(wants.length).toBeGreaterThanOrEqual(1);
  });

  it('every atom has a non-empty quote', () => {
    const transcript =
      "okay so there's this offer in Seattle it's more money a lot more but Maya just started her new school and she finally has friends and i keep telling myself it's about the career but honestly i think i'm just scared of staying still my lease is up in March anyway and Dad's not getting any younger i'd be further from him i don't know is it even the right time or am i just running";
    const atoms = localExtract(transcript);
    expect(atoms.length).toBeGreaterThan(0);
    for (const atom of atoms) {
      expect(atom.quote.trim().length).toBeGreaterThan(0);
    }
  });

  it('all atoms from the canonical transcript have status "forming"', () => {
    const atoms = localExtract(
      "okay so there's this offer in Seattle but Maya just started school and i'm scared of staying still my lease is up and i don't know",
    );
    expect(atoms.every((a) => a.status === 'forming')).toBe(true);
  });

  it('does not produce duplicate atoms for repeated mentions', () => {
    const atoms = localExtract(
      'my dad keeps calling me and my dad is worried and my dad said i should come home',
    );
    const people = atoms.filter((a) => a.kind === 'person');
    // Should deduplicate "dad" into one person atom
    const dadAtoms = people.filter((p) => p.label.toLowerCase().includes('dad'));
    expect(dadAtoms.length).toBe(1);
  });

  it('labels are clamped to ≤80 chars (a short summarizing sentence)', () => {
    const atoms = localExtract(
      "i'm worried that this really long sentence about many things going wrong will produce a very long label that exceeds the limit and causes display issues",
    );
    for (const atom of atoms) {
      expect(atom.label.length).toBeLessThanOrEqual(80);
    }
  });

  it('quotes are clamped to ≤120 chars', () => {
    const atoms = localExtract(
      'i am worried about this incredibly long sentence that has so many words in it that it would far exceed the quote character limit we have set in the system and would cause overflow issues in the canvas',
    );
    for (const atom of atoms) {
      expect(atom.quote.length).toBeLessThanOrEqual(120);
    }
  });
});

// ── countThoughts ────────────────────────────────────────────────────────────
describe('countThoughts', () => {
  it('counts several thoughts inside one breathless utterance', () => {
    const n = countThoughts(
      "i want to learn linear algebra but i'm worried it's too abstract and i also need to figure out how to go viral",
    );
    expect(n).toBeGreaterThan(1);
  });

  it('a single short clause counts as one thought', () => {
    expect(countThoughts('just go for it')).toBe(1);
  });

  it('empty text counts as zero', () => {
    expect(countThoughts('   ')).toBe(0);
  });
});

// ── looksLikeThinkingAloud ───────────────────────────────────────────────────
describe('looksLikeThinkingAloud', () => {
  it('a short, direct question is not thinking aloud (answer it directly)', () => {
    expect(looksLikeThinkingAloud("what's the capital of France")).toBe(false);
    expect(looksLikeThinkingAloud('how do I center a div?')).toBe(false);
  });

  it('multiple thoughts in one breath reads as thinking aloud', () => {
    expect(
      looksLikeThinkingAloud(
        "i should take the job but i'm scared and my partner wants to stay near family",
      ),
    ).toBe(true);
  });

  it('a longer exploratory single-thought utterance reads as thinking aloud', () => {
    expect(
      looksLikeThinkingAloud(
        'making a learning roadmap for linear algebra and directions to take it open source',
      ),
    ).toBe(true);
  });

  it('a long single-clause question still answers directly (not a ramble)', () => {
    expect(
      looksLikeThinkingAloud(
        'can you explain how eigenvalues and eigenvectors describe the way a linear transformation stretches space',
      ),
    ).toBe(false);
  });

  it('empty text is never thinking aloud', () => {
    expect(looksLikeThinkingAloud('')).toBe(false);
  });
});
