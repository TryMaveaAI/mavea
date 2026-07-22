// flying.ts, "Your preflight, walked through" — a private pilot's walk-around before
// taxiing a Cessna 172, rendered as one tap-through checklist grouped by phase of flight.
// The showcase + render-coverage demo for `preflightchecklist`, the forms family's
// safety-critical sibling to `actionchecklist`.
import type { ConversationSpec } from '../conversation';

export const flying: ConversationSpec = {
  id: 'flying',
  workspace: 'Preflight',
  title: 'Your preflight, walked through',
  sub: 'N172ME, phase by phase, before you push the throttle forward.',
  opener:
    "Ceiling's high and winds are calm, good day to fly. Let's run the walk-around before you taxi.",
  switchSay: "Let's run your preflight.",
  gather: 'Pulling the checklist for your aircraft',
  found: "Here's the full walk-around, tap through it as you go.",
  tint: '#5ec8f2',
  context: [
    { name: 'N172ME · Cessna 172S', color: 'var(--presence-soft)' },
    { name: 'METAR · VFR', color: 'var(--insight)' },
  ],
  blocks: [
    {
      type: 'preflightchecklist',
      col: 8,
      delay: 0,
      props: {
        title: 'Preflight — N172ME',
        icon: 'shield',
        iconColor: 'var(--presence)',
        aircraft: 'N172ME · Cessna 172S',
        sections: [
          {
            name: 'Before Start',
            items: [
              { label: 'Walk-around inspection — COMPLETE', critical: true, checked: true },
              { label: 'Seats, belts, doors — adjusted and locked', critical: true, checked: true },
              {
                label: 'Fuel quantity — CHECK visually, both tanks',
                critical: true,
                checked: true,
              },
              { label: 'Circuit breakers — IN', checked: true },
              { label: 'Parking brake — SET', checked: true },
            ],
          },
          {
            name: 'Before Takeoff',
            items: [
              { label: 'Flight controls — free and correct movement', critical: true },
              { label: 'Flight instruments — set, altimeter to field elevation' },
              { label: 'Trim tabs — set for takeoff' },
              { label: 'Fuel selector — BOTH', critical: true },
              { label: 'Mixture — rich' },
              { label: 'Doors and windows — closed and latched', critical: true },
              { label: 'Run-up — magnetos checked, max 150 RPM drop', critical: true },
            ],
          },
          {
            name: 'Cruise',
            items: [
              { label: 'Engine gauges — in the green arc' },
              { label: 'Fuel — monitor both tanks, switch as needed' },
              { label: 'Altitude — maintain assigned or cruise altitude' },
            ],
          },
          {
            name: 'Before Landing',
            items: [
              { label: 'ATIS or airport advisory — obtained' },
              { label: 'Seatbelts and harnesses — fastened', critical: true },
              { label: 'Mixture — rich' },
              { label: 'Fuel selector — BOTH', critical: true },
              { label: 'Landing light — ON' },
            ],
          },
          {
            name: 'Shutdown',
            items: [
              { label: 'Parking brake — SET' },
              { label: 'Avionics and electrical — OFF' },
              { label: 'Mixture — idle cutoff' },
              { label: 'Ignition and master switch — OFF', critical: true },
              { label: 'Control lock — installed' },
            ],
          },
        ],
        footer:
          'IMSAFE check clear, weight and balance within limits, fuel for the leg plus reserve.',
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'home',
  tryChip: { label: 'Run a preflight checklist', route: 'topic:flying' },
  suggests: [],
  keywords: [{ test: /preflight|walk-?around|before (you|we) taxi|cessna/, route: 'topic:flying' }],
};
