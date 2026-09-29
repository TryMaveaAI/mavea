// Whether a click landed on something that acts on it. The Lens's selector list (LENS_IGNORE)
// knows semantic controls, but the 595-component library is full of interactive SVG: bars that
// select, nodes that drag, canvases that pan — none with a role. Every one of those declares its
// affordance the same way, through the cursor, so that is the signal: an element that shows a
// pointer, grab, crosshair or resize cursor is asking to be operated, not to open the Lens.

const ACTIVE_CURSORS =
  /^(pointer|grab|grabbing|crosshair|move|cell|zoom-in|zoom-out|copy|(\w+-)?resize)$/;

/** True when `target` or an ancestor up to (not including) `boundary` advertises a cursor that
 *  means "operate me". Reads computed style on click only, so it costs nothing at rest. */
export function ownsClick(target: Element | null, boundary: Element): boolean {
  for (let el = target; el && el !== boundary; el = el.parentElement) {
    if (ACTIVE_CURSORS.test(getComputedStyle(el).cursor)) return true;
  }
  return false;
}
