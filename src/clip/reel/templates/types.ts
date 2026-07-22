// The contract every reel "finish" implements. A finish is a pure function of the typed slots for the
// CONTENT TYPE it renders (a `stat`, a `concept`, a `quote`…) — palette, motion, fit and the
// surrounding chrome all come from `.reel` ancestors, reel.css and the FitScale wrapper, so a finish
// never touches color, fit or layout outside its own card. Sizes use container units (cqh = 1% of the
// 9:16 board height) so a finish scales identically in the preview and the export.
import type { SlotKey, SlotsFor } from '../reelScript';

export type SlideProps<K extends SlotKey> = { slots: SlotsFor<K> };
