import { createContext } from 'react';

/** Whether an embedded figure should freeze its entrance motion. True (the default) for a static
 *  raster capture, so the PDF is deterministic; `SlideStage` sets it false for the live preview and
 *  Present stage, where figures animate in and stay subtly interactive. A leaf module (no other
 *  imports) so both `SlideStage` and the figure layout can read it without an import cycle. */
export const FigureStatic = createContext(true);
