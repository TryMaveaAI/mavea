// Guards the reel finish surface/card contract.
//
// A finish tagged `surface:'dark'` makes the player lay a dark wash behind it and flip --reel-ink
// near-white (reel.css). That only reads correctly when the finish OWNS the frame (`bleed`) and draws
// on the dark wash. A NON-bleed finish renders the LIGHT card primitive, so a dark surface would put
// near-white ink on a white card → invisible text (the levelUp/streak regression). The FinishDef
// contract states it directly: "Card-based finishes leave this off." This test fails if any finish
// ever pairs surface:'dark' with a non-bleed (card) layout again.
import { describe, it, expect } from 'vitest';
import { FINISH } from '../src/clip/reel/templates/registry';

describe('reel finish surface contract', () => {
  it('no card-based (non-bleed) finish uses a dark surface', () => {
    const offenders = Object.entries(FINISH)
      .filter(([, def]) => def && def.surface === 'dark' && !def.bleed)
      .map(([id]) => id);
    expect(offenders).toEqual([]);
  });
});
