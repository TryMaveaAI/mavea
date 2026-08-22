// The actions layer: the curated set of things Mavéa can PROPOSE (catalog), and the
// runner that executes a CONFIRMED one through the same-origin `/actions` proxy. Nothing
// fires without the user confirming on the card. See ./catalog for the architecture note.
export { ACTIONS, actionSpec, enabledActions, actionsMenu } from './catalog';
export { runAction } from './run';
