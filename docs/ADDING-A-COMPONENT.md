# Adding a canvas block

Mavéa renders every answer as typed **blocks** — charts, comparisons, diagrams, and the whole
interface kit (modals, tabs, forms…). All of it is one discriminated union, `Block`, and all of it
is described the same way. Adding the next block is a small, mechanical, well-guarded change: this
is the canonical guide.

> **One standard.** A block is described to Live by exactly one thing — its **`ComponentMeta`** in
> `src/canvas/blocks/catalog/families/<family>.ts`. That is the single source of truth the selector,
> prompt, and coercer all read (via the generated `catalog/facts` + lazy `catalog/details`).
> `registry-types.ts` defines only the _render_ contract (`BlockRegistry` + `BlockCommon`); it is not
> a second metadata system.

## Quickstart: `pnpm new:block`

```bash
pnpm new:block <family> <type> [ComponentName]
# e.g.
pnpm new:block charts2 sparkline            # component "Sparkline"
pnpm new:block code     syntaxbreakdown SyntaxBreakdown
```

The scaffold creates the component + a CSS stub and wires the three required edits (the family
`types.ts`, `registry.tsx`, and the `ComponentMeta` catalog) when it recognises a family's standard
file shape; otherwise it prints a ready-to-paste snippet for that one file (it never corrupts a
file). Then it tells you the one thing it _can't_ do for you: add a real **demo**.

After scaffolding you:

1. Flesh out the component, its props, its styles, and the catalog `blurb`.
2. **Add a demo** — a real instance of the block in a `src/data/topics/*` spec (see below).
3. Verify: `pnpm gen:catalog && pnpm typecheck && pnpm test && pnpm knip`.

## The contract (what `new:block` wires, and what each piece is for)

A block lives in a **family** under `src/canvas/blocks/<family>/`. Adding one to an existing family
never touches the core renderer or the global union — it is data + one registry line:

| Step                     | File                           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Props + union variant | `<family>/types.ts`            | The block's typed props, and its arm of the family's `Block` sub-union (`… \| (BlockBase & { type: 'x'; props: XProps })`).                                                                                                                                                                                                                                                                                                                                                                |
| 2. The component         | `<family>/<Component>.tsx`     | Hand-rolled SVG/DOM. See **the standard** below.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3. Registry entry        | `<family>/registry.tsx`        | `x: (p, c) => <X {...(p as XProps)} delay={c.delay} />` — maps the `type` key to the renderer.                                                                                                                                                                                                                                                                                                                                                                                             |
| 4. Family-map line       | `blocks/familyMap.ts`          | `x: '<family>',` in the family's section — the per-family loader's index (a canvas render only downloads the family chunks it uses). `tests/family-map.test.ts` fails if it's missing or misfiled.                                                                                                                                                                                                                                                                                         |
| 5. Styles                | `<family>/styles.css`          | Scoped CSS using design tokens (no hex).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6. **ComponentMeta**     | `catalog/families/<family>.ts` | `createMeta('x', {…})` — **without this, the block renders but Live can never select it.** Data shapes, required/optional props, tier, and a blurb. _Exception: capability-gated blocks that are only reachable through a dedicated non-catalog path (e.g. `mindshape`, only generated by Watch Me Think) add their type to `META_OPTIONAL` in `tests/component-protocol.test.ts` instead, with a comment explaining the gate. This is a deliberate, reviewed choice — never the default._ |
| 7. **A demo**            | `src/data/topics/*.ts`         | A real authored instance. It's the block's canonical example: what `#/gallery` shows and what Live shows the model so it fills the exact shape.                                                                                                                                                                                                                                                                                                                                            |

Starting a **new family** additionally adds the family's union to `src/canvas/blocks/index.ts`, its
import line to `src/canvas/blocks/loader.ts` + `familyMap.ts`, and a labelled entry to
`src/gallery/families.ts`.

## The standard (every block follows)

- **Shell:** wrap in `.card.reveal` with a `.card-eyebrow` (icon + title). Forward `delay` from
  `BlockCommon` via the `--delay` CSS var.
- **Tokens only — never raw hex** in JSX or CSS. Use `--insight` / `--warning` / `--danger` /
  `--surface-*` / `--grid-line`; opacity via `color-mix(in oklab, …)`. Light/dark is then automatic.
- **Overflow-safe:** guard empty/degenerate data; never let content overflow the card (`min-width: 0`
  on flex/grid children, wrap dynamic text). Verify in `#/gallery`, light and dark. If the content has
  a genuine intrinsic minimum size CSS can't shrink (a dense diagram, a fixed-coordinate SVG, a wide
  table with a hard per-column floor), reflow/scroll first — only add the type to `FIT_TYPES` in
  `src/canvas/layout/fitPolicy.ts` (wraps it in `FitBox`, which scales the whole block down to fit)
  once you've confirmed nothing else already handles it; don't double up on a component with its own
  working responsive logic.
- **Untrusted text is escaped.** Model/user strings render through React text nodes (auto-escaped).
  Only render HTML with `dangerouslySetInnerHTML` for fields that are sanitised (see
  `src/lib/richText.ts`); never inject raw model output as HTML.
- **No leaks:** every timer/listener/observer/animation is cleaned up on unmount. Use
  `useTimeout` / `useInterval` from `src/hooks/` so timers auto-cancel.

## Motion

Reach for the shared primitives in `src/canvas/lib/motion.css` / `motion.ts` — don't hand-roll a
new `@keyframes`. Pick by what the content _is_:

| Content                                                     | Primitive                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Hero number / KPI figure                                    | `useCountUp` (`canvas/lib`) — bounded count-up, reduced-motion snap |
| Ranked list rows, table rows, chat messages, timeline steps | `.m-stagger-item` + `.m-fade-rise` (`--i` per item)                 |
| Chart lines/paths, circuit traces                           | `usePathDraw` (`canvas/lib`) — measures the real path, draws it on  |
| Interactive card (hover)                                    | already handled — `.card-grid .card` in `src/styles/wow-polish.css` |

`usePathDraw`/`useCountUp` both check `prefers-reduced-motion` themselves, so a consumer can't
forget it. The interactive-card hover-lift is a global rule keyed off `.card-grid`, not a class
you add per block — don't re-declare a hover transform on a card, the existing rule already
covers it.

**Off-limits, no exceptions:**

- No new `animation-iteration-count: infinite` (or other looping motion) on a canvas block. A
  loading affordance (spinner, skeleton shimmer) may keep looping for the duration of its own
  loading/recording state — that's a different, narrower thing than ambient decoration. The
  Presence aura's conic drift and a live-status dot's pulse are the app's only always-on ambient
  loops, and both live outside `canvas/blocks/`; they're a deliberate, reviewed exception, not a
  precedent for a new one.
- Animate `transform`/`opacity`/`filter` only — never `width`/`height`/`top`/`left`/`margin`.
  This is a hard requirement (not just a perf nicety) on any block listed in `FIT_TYPES`
  (`src/canvas/layout/fitPolicy.ts`): `FitBox` measures that block once on mount and never again,
  so a post-mount size change goes unnoticed and the block overflows its card.

## What the gates enforce (so you can't ship it half-wired)

- **`component-protocol.test.ts`** — every registered/core block type has a `ComponentMeta` (catches a
  forgotten meta: the silent "renders but Live ignores it" bug), and every meta names a renderable
  type. It also asserts the gallery covers every family.
- **`canvas-render.test.tsx` / `live-examples.test.ts`** — every registered type must appear in a
  topic demo; the suite stays red until you add one.
- **`leak-guard.test.tsx`** — mounts then unmounts every block under fake timers; a leaked timer
  fails it.
- **`data-integrity.test.ts`** — authored blocks use only the allowed color tokens and a valid grid
  span.

## ComponentMeta fields

`createMeta(type, over)` fills sensible defaults; you mainly set:

- `family` — the on-disk folder name.
- `dataShapes` — the kinds of data this block is _for_ (e.g. `['series']`, `['comparison']`); the
  selector matches these against the ask. See `DataShape` in `catalog/meta.ts`.
- `requires` / `optional` — prop keys; a block missing a required prop is dropped, never shown empty.
- `tier` — `base` (offered to small/local models too), `frontier`, or `cutting`.
- `colDefault` / `colMin` — 12-col grid span.
- `wowWeight` — 0–1, how impressive a well-filled instance is (biases selection).
- `blurb` — one line: what it shows and when to use it (shown to the model).
- `itemShapes` — for object-array props, names the text field + synonyms so loose model JSON coerces.

## Custom coercion & nesting (rare)

A block whose props the generic coercer can't reconstruct (nested/recursive shapes) sets
`coercer: 'custom'`, adds a builder + `switch` case in `engine/liveSchema.ts`, and is listed in
`HAND_BUILT` (`live/select/catalog.ts`). A block that nests other `Block`s (like `composite`) is
rendered by a dedicated branch in `canvas/TopicCanvas.tsx`.

See also: [CONTRIBUTING.md](../CONTRIBUTING.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) ·
[docs/ENGINEERING.md](./ENGINEERING.md).
