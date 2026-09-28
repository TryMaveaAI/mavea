// The figure archetype: a real canvas component (a Sankey, a state machine, a candlestick, a code
// listing) rendered at full fidelity inside the document — themed to the skin and scaled to fit the
// page — instead of being flattened to text or bars. It composes the same SectionHeading / Caption
// chrome as every other archetype, so a figure reads as a numbered "FIG. N" plate in the document's
// own voice; the visual itself comes from `canvas/embed`.
import { FigureEmbed } from '../../../canvas/embed';
import { paletteFor } from './figurePalette';
import { blockKind } from '../../../canvas/blockLabel';
import { contentWidth } from '../../paginate/geometry';
import { Caption, SectionHeading } from './parts';
import { frameHeight } from './figureFrame';
import type { SectionComponent } from '../types';

export const Figure: SectionComponent<'figure'> = ({ data, skin, format = 'letter' }) => {
  const kind = blockKind(data.block); // "SANKEY", "STATE MACHINE", "CANDLESTICK"
  const frame = {
    w: contentWidth(skin.tokens.padding, skin.tokens.pageBorderLeft, format),
    h: frameHeight(data.embed),
  };
  return (
    <div>
      <SectionHeading
        skin={skin}
        fig={data.fig}
        label={data.heading ?? kind}
        trailing={data.heading ? kind : undefined}
      />
      <FigureEmbed block={data.block} palette={paletteFor(skin)} frame={frame} />
      {data.caption && <Caption skin={skin} text={data.caption} />}
    </div>
  );
};
