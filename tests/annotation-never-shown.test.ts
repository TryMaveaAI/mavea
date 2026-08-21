// The pronunciation is for the voice. It must never reach the reader — anywhere.
//
// The model is told to mark speech-risky spans as [[shown|said]], and it does so freely, in ANY
// field it writes: a chip, a title, a mark label, a track reason. Only narration / note / tour are
// split into a spoken twin upstream; every other field is display-only, so a field that skips
// forDisplay prints the literal markup on the card. Rather than audit fields one at a time — and
// re-audit every time one is added — this validates a response whose EVERY string is annotated and
// then walks the whole result, so a new unsanitized field fails here the day it lands.
import { describe, it, expect } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';

/** Every string in a value, with the path that led to it — so a failure names the field. */
function strings(value: unknown, path = '$'): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      strings(v, `${path}.${k}`),
    );
  }
  return [];
}

/** Spoken twins are the ONE place the said side is supposed to survive — they are never rendered. */
const SPOKEN_FIELDS = /\.(spoken|saySpoken|noteSpoken|captionSpoken)$/;

/** A response with an annotation in every model-authored string we can reach. */
function annotatedEverywhere(): string {
  return JSON.stringify({
    title: 'The [[CUDA|kooda]] rollout',
    sub: 'Costing [[$5,000/mo|five thousand dollars a month]]',
    narration: 'It runs on [[CUDA|kooda]] and costs [[$5,000/mo|five thousand a month]].',
    topic: 'Technology',
    continuity: 'replace',
    causal: false,
    chips: ['What does [[CUDA|kooda]] cost?', 'Compare to [[nginx|engine x]]'],
    understood: ['[[CUDA|kooda]] rollout', 'about [[$5,000/mo|five thousand a month]]'],
    corrects: {
      what: 'the [[GUI|gooey]] claim',
      was: 'it shipped with a [[GUI|gooey]]',
      now: 'it ships headless',
    },
    track: { score: 90, reason: 'the [[CUDA|kooda]] spend moves weekly' },
    tour: [
      {
        index: 0,
        say: 'This is the [[CUDA|kooda]] line.',
        marks: [{ kind: 'circle', at: '[[CUDA|kooda]]', label: 'the [[GUI|gooey]] bit' }],
      },
    ],
    blocks: [
      {
        type: 'insight',
        props: {
          title: 'The [[CUDA|kooda]] bill',
          stat: '[[$5,000/mo|five thousand dollars a month]]',
          summary: 'Driven by [[GUI|gooey]] rendering on [[nginx|engine x]].',
        },
        note: 'The [[CUDA|kooda]] bill is the whole story.',
      },
      {
        type: 'list',
        props: {
          title: 'Where it goes',
          items: ['[[CUDA|kooda]] compute', '[[nginx|engine x]] hosting'],
        },
      },
      {
        type: 'kpi',
        props: {
          title: 'Buckets',
          items: [
            { label: '[[CUDA|kooda]]', value: '[[$3,000|three thousand dollars]]', sub: 'compute' },
          ],
        },
      },
    ],
  });
}

describe('no rendered field carries the pronunciation markup', () => {
  const spec = validateLiveResponse(annotatedEverywhere());

  it('validates at all', () => {
    expect(spec).not.toBeNull();
    expect(spec?.blocks.length).toBeGreaterThan(0);
  });

  it('leaves no [[shown|said]] span anywhere a reader could see it', () => {
    const leaked = strings(spec)
      .filter(({ path }) => !SPOKEN_FIELDS.test(path))
      .filter(({ text }) => text.includes('[['));
    expect(leaked).toEqual([]);
  });

  it('keeps the SHOWN side, so nothing the reader sees is lost', () => {
    const shown = strings(spec)
      .filter(({ path }) => !SPOKEN_FIELDS.test(path))
      .map((s) => s.text)
      .join(' ');
    expect(shown).toContain('CUDA');
    expect(shown).toContain('$5,000/mo');
    // The said side belongs to the voice alone — it must not appear in anything rendered.
    expect(shown).not.toContain('kooda');
    expect(shown).not.toContain('engine x');
  });

  it('still hands the voice its own reading', () => {
    expect(spec?.spoken).toContain('kooda');
    expect(spec?.spoken).not.toContain('[[');
  });
});
