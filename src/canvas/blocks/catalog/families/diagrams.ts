// Catalog entries for the `diagrams` family — the fact sheet the Live selector retrieves over
// and the prompt menu is built from. This module carries the DETAIL fields (blurb, requires,
// optional, item shapes, prop hints); the compact selection facts are generated from it into
// facts.generated.ts. It is loaded lazily, only for the families a turn actually reaches, which is
// what keeps per-turn cost proportional to the answer rather than to the library.
//
// After editing, run `pnpm gen:catalog` — a staleness test fails the build otherwise.
import { createMeta, type ComponentCatalog } from '../meta';

export const CATALOG_DIAGRAMS: ComponentCatalog = [
  // — diagrams —
  createMeta('diagramflow', {
    family: 'diagrams',
    // The general relationship primitive: any topology of labelled nodes and links.
    // Tagged across the shapes that aren't strictly hierarchical (flows owns those) so
    // the selector reaches for it when an ask is about a process, a state machine, a
    // feedback loop, or how parts relate — the cases no single bespoke block covers.
    dataShapes: ['flow', 'relationship', 'sequence', 'hierarchy'],
    requires: ['title', 'nodes', 'edges'],
    optional: ['icon', 'iconColor', 'layout', 'footer'],
    interactive: false,
    // High wow + 'cutting' tier: it draws figures the rest of the library can't, but its
    // nested node/edge props are only reliably filled by a strong model (small/local tiers
    // are withheld and lean on the safer base shapes instead).
    wowWeight: 0.82,
    tier: 'cutting',
    colDefault: 8,
    colMin: 6,
    coercer: 'custom',
    blurb:
      'Freeform diagram for processes, state machines, feedback loops, concept maps. nodes:[{id,label,sub?,kind?}], edges:[{from,to,label?,dashed?}] referencing node ids; layout:cycle|layered|free.',
    propHints: {
      layout: "'cycle'|'layered'|'free'",
      'nodes[].kind': "'default'|'start'|'accent'|'good'|'warn'|'muted' (drives the node's color)",
      'edges[].kind': "'default'|'accent'|'good'|'warn'|'muted' (drives the link's color)",
    },
  }),
  createMeta('composite', {
    family: 'diagrams',
    // The "arrange a NEW layout from existing blocks" primitive: when no single block fits
    // but a small grid of two or three would, the model composes them. Tagged broadly (it's
    // shape-agnostic — it's about LAYOUT, not data) so it's reachable for any rich ask where
    // a custom side-by-side arrangement beats stacking separate cards.
    dataShapes: ['comparison', 'relationship', 'composition', 'keyvalue'],
    requires: ['title', 'regions'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    // Tagged 'diagrams' for retrieval, but it's a CORE layout container (a sub-grid of other
    // blocks, rendered recursively by TopicCanvas — not in the extended registry), so it isn't a
    // standalone figure. Keep it on its designed archetype.
    embed: 'none',
    // Highest wow (it builds something genuinely new) + 'cutting': nesting real blocks is
    // only reliable on a strong model. Wide by default — it holds several blocks.
    wowWeight: 0.86,
    tier: 'cutting',
    colDefault: 12,
    colMin: 8,
    coercer: 'custom',
    blurb:
      'Compose a NEW layout from 2+ existing blocks side by side when nothing single fits. regions:[{block:{type,props}, span?(1-12)}] — each block is any other type (chart, kpi, compare, …).',
  }),
  // — diagrams additions —
  createMeta('sequencediagram', {
    family: 'diagrams',
    dataShapes: ['sequence', 'flow'],
    requires: ['title', 'actors', 'messages'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.83,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'UML-style sequence diagram; actors exchange labelled messages with optional return arrows.',
    itemShapes: [{ prop: 'actors', text: 'label', textAliases: ['name', 'participant', 'title'] }],
    propHints: {
      'messages[].reply': 'true for a dashed return arrow',
      'messages[].self': 'true for a self-call loop',
    },
  }),
  createMeta('statemachine', {
    family: 'diagrams',
    dataShapes: ['flow', 'sequence'],
    requires: ['title', 'states', 'transitions'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.84,
    tier: 'frontier',
    colDefault: 10,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Directed-graph state machine; nodes are states, edges are transitions with trigger labels.',
    itemShapes: [
      {
        prop: 'states',
        text: 'label',
        textAliases: ['name', 'state', 'title'],
        requiredFields: ['id'],
      },
      { prop: 'transitions', requiredFields: ['from', 'to', 'label'] },
    ],
    propHints: {
      'states[].id': 'unique nonblank id within this block',
      'transitions[].from': 'exactly one existing states[].id',
      'transitions[].to': 'exactly one existing states[].id',
      'states[].start': 'true to mark the entry state',
      'states[].final': 'true to mark an accepting/terminal state',
    },
  }),
  createMeta('erdiagram', {
    family: 'diagrams',
    dataShapes: ['relationship', 'hierarchy'],
    requires: ['title', 'entities', 'relationships'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 12,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'Entity-relationship diagram; tables as boxes with typed fields, lines show cardinality.',
    itemShapes: [{ prop: 'entities', text: 'label', textAliases: ['name', 'table', 'entity'] }],
    propHints: {
      'entities[].fields[].key': "'pk'|'fk'",
      'relationships[].fromCard': "'1'|'many'",
      'relationships[].toCard': "'1'|'many'",
    },
  }),
  createMeta('circuitdiagram', {
    family: 'diagrams',
    dataShapes: ['flow'],
    requires: ['title', 'components', 'wires'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.79,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Schematic circuit diagram with resistors, capacitors, voltage sources, and wire routing.',
    itemShapes: [
      {
        prop: 'components',
        text: 'label',
        textAliases: ['name', 'id', 'value'],
        requiredFields: ['id', 'kind', 'x', 'y'],
        closedVocabFields: ['kind'],
      },
      { prop: 'wires', requiredFields: ['from', 'to'] },
    ],
    propHints: {
      'components[].id': 'unique nonblank id within this block',
      'components[].kind': "'battery'|'resistor'|'capacitor'|'bulb'|'switch'|'ground'|'node'",
      'components[].x': 'position 0..100 on the canvas',
      'components[].y': 'position 0..100 on the canvas',
      'wires[].from': 'exactly one existing components[].id',
      'wires[].to': 'exactly one existing components[].id',
    },
  }),
  createMeta('controlblockdiagram', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure'],
    requires: ['title', 'blocks', 'wires'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A control-systems block diagram: transfer-function blocks as labeled rectangles joined by directional signal wires, with a summing junction drawn as a small +/- circle. Blocks auto-place left-to-right by graph order when x/y are omitted; a wire marked feedback routes as a rectangular loop back to an earlier block. Use for "draw the PID control loop", "block diagram of a thermostat", closed-loop transfer functions, feedback-control coursework.',
    itemShapes: [
      {
        prop: 'blocks',
        text: 'label',
        textAliases: ['name', 'id'],
        requiredFields: ['id', 'kind'],
        closedVocabFields: ['kind'],
      },
      { prop: 'wires', requiredFields: ['from', 'to'] },
    ],
    propHints: {
      'blocks[].id': 'unique nonblank id within this block',
      'blocks[].kind':
        "'block'|'sum' — 'block' is a labeled transfer-function rectangle, 'sum' is a summing junction",
      'blocks[].x': 'optional position 0..100; omit both x and y to auto-place left-to-right',
      'blocks[].y': 'optional position 0..100; omit both x and y to auto-place left-to-right',
      'wires[].sign':
        "'plus'|'minus' — only meaningful when the wire's `to` is a sum block; default plus",
      'wires[].feedback':
        'true to route this wire as a rectangular loop back to an earlier block, instead of a straight line',
      'wires[].from': 'exactly one existing blocks[].id',
      'wires[].to': 'exactly one existing blocks[].id',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['engineering', 'science', 'code'],
  }),
  createMeta('fiveforces', {
    family: 'diagrams',
    dataShapes: ['comparison', 'structure'],
    requires: ['title', 'industry', 'forces'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Porter\'s Five Forces: a central Industry Rivalry hub with four satellite forces (new entrants, suppliers, buyers, substitutes) ringed around it; connector thickness and color track each force\'s rated strength. Use for a competitive-strategy analysis, "should we enter this market", an industry-structure teardown.',
    itemShapes: [{ prop: 'forces', text: 'label', textAliases: ['name', 'force', 'title'] }],
    propHints: {
      'forces[].id':
        "'rivalry'|'newEntrants'|'suppliers'|'buyers'|'substitutes' — exactly one of each",
      'forces[].strength': "'low'|'medium'|'high'",
      'forces[].note': 'a short line of supporting context, shown under the label',
    },
    intents: ['explain', 'decide', 'reference'],
    domains: ['business'],
  }),
  createMeta('fivewhychain', {
    family: 'diagrams',
    dataShapes: ['sequence', 'structure'],
    requires: ['title', 'problem', 'whys'],
    optional: ['icon', 'iconColor', 'rootCause', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'base',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A 5-Whys root-cause chain: a problem card, then a vertical stack of why→answer cards drilling one level deeper each step, ending on an accent-highlighted root cause. Use for an incident postmortem, a root-cause investigation, "why did this actually happen".',
    itemShapes: [{ prop: 'whys', text: 'answer', textAliases: ['text', 'reason', 'because'] }],
    propHints: {
      'whys[].question': 'the "why" question this step asks, e.g. "Why did the build fail?"',
      rootCause:
        'an explicit closing statement appended as its own card; omit to highlight the last why instead',
    },
    intents: ['explain', 'reflect', 'reference'],
    domains: ['business', 'code', 'education'],
  }),
  createMeta('sysarchdiagram', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure', 'relationship'],
    requires: ['title', 'nodes', 'edges'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.85,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A system-design whiteboard diagram: each node kind is a distinct SHAPE, not just a color — database is a cylinder, queue is a stacked rectangle, cache is a rounded diamond, loadbalancer is a hexagon; client/service/gateway/cdn share a rounded-rectangle silhouette told apart by a small inline icon. Auto-laid-out left-to-right by the edge graph. Use for "draw the system architecture", "whiteboard this design", a load-balanced web service, a CQRS/event pipeline, a CDN-fronted API, system-design-interview walkthroughs.',
    itemShapes: [
      {
        prop: 'nodes',
        text: 'label',
        textAliases: ['name', 'id'],
        requiredFields: ['id', 'kind'],
        closedVocabFields: ['kind'],
      },
      { prop: 'edges', requiredFields: ['from', 'to'] },
    ],
    propHints: {
      'nodes[].id': 'unique nonblank id within this block',
      'nodes[].kind':
        "'client'|'loadbalancer'|'service'|'database'|'cache'|'queue'|'gateway'|'cdn'",
      'nodes[].sub': 'optional second line — an instance count, a tech name, a region',
      'edges[].label': 'what the connection does, e.g. "writes", "cache-aside"',
      'edges[].protocol': 'the wire protocol, e.g. "HTTPS", "gRPC", "TCP:5432"',
      'edges[].from': 'exactly one existing nodes[].id',
      'edges[].to': 'exactly one existing nodes[].id',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'tech', 'business'],
  }),
  createMeta('datapipeline', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure'],
    requires: ['title', 'stages', 'edges'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'An ETL/data-pipeline lineage diagram: offline batch data flow from a source through transform steps to a sink or intermediate store, each drawn as a distinct shape — source is a rounded rectangle with an inbound-arrow glyph, transform is a hexagon, sink/store share a database-cylinder silhouette told apart by a small icon. Auto-laid-out left-to-right by the edge graph. Distinct from sysarchdiagram (a live request/response service architecture) — this is where data comes from and what happens to it on the way to rest. Use for "draw the ETL pipeline", "how does data flow from raw logs to the feature store", a training-data pipeline, an ELT/batch-ingestion diagram.',
    itemShapes: [{ prop: 'stages', text: 'label', textAliases: ['name', 'id'] }],
    propHints: {
      'stages[].kind': "'source'|'transform'|'sink'|'store'",
      'stages[].sub': 'optional second line — a tech name, a cadence, a row count',
      'edges[].label': 'what happens on this hop, e.g. "dedup", "join labels", "batch insert"',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'tech', 'science'],
  }),
  createMeta('threatmodel', {
    family: 'diagrams',
    dataShapes: ['structure', 'relationship'],
    requires: ['title', 'assets', 'threats'],
    optional: ['icon', 'iconColor', 'boundaries', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'cutting',
    colDefault: 9,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A STRIDE cybersecurity threat model: dashed trust-boundary rects host labeled asset chips (process/datastore/external-entity), a small marker on each threatened asset is red for an open threat and muted for a mitigated one, and a full threat register lists every entry below. Use for a system security review, "what could go wrong with this design", an architecture threat-model writeup.',
    itemShapes: [
      { prop: 'assets', text: 'name', textAliases: ['label', 'title'] },
      { prop: 'boundaries', text: 'label', textAliases: ['name', 'title'] },
    ],
    propHints: {
      'assets[].kind': "'process'|'datastore'|'external-entity'",
      'boundaries[].contains': 'asset ids hosted inside this trust boundary',
      'threats[].assetId': 'the id of the asset this threat targets',
      'threats[].stride':
        "'spoofing'|'tampering'|'repudiation'|'info-disclosure'|'dos'|'elevation'",
      'threats[].status': "'mitigated'|'open' — missing/unrecognized reads as open",
    },
    intents: ['explain', 'reference', 'decide'],
    domains: ['code', 'tech', 'business'],
  }),
  createMeta('foodweb', {
    family: 'diagrams',
    dataShapes: ['structure', 'relationship'],
    requires: ['title', 'tiers', 'organisms', 'links'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.77,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'An ecological food web: organisms sit in horizontal tier bands (lowest trophic level at the bottom), joined by curved arrows from prey to predator. Distinct from pyramidtiers (an abstract biomass/energy pyramid with no individual organisms) — this is the actual who-eats-whom graph. Use for a food chain / food web diagram, an ecosystem teardown, "what eats what here".',
    itemShapes: [{ prop: 'organisms', text: 'label', textAliases: ['name', 'species'] }],
    propHints: {
      tiers:
        'tier names, lowest trophic level first, e.g. ["Producers", "Primary consumers", "Apex predators"]',
      'organisms[].tier': 'index into tiers, 0 = lowest',
      'links[].from': 'prey organism id — the arrow starts here',
      'links[].to': 'predator organism id — the arrow points here',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
    stringItems: ['tiers'],
  }),
  createMeta('recursiontree', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'structure', 'sequence'],
    requires: ['title', 'root'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 9,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A call-stack / recursion tree: a single root call fans out into its own recursive children (n-ary, tidy top-down layout, never overlapping). Each node shows its call signature; once resolved, a small corner badge shows the returned value. Classic use: naive recursive fibonacci, factorial, the call tree behind a memo table.',
    // No `itemShapes`: `root` is a SINGLE recursive RecursionNode, not an item array — see
    // parsetree's identical note. itemShapes would array-normalize `root` and trip the
    // requires-check; the recursive `children` are laid out by the component itself.
    propHints: {
      'root.call': 'the call signature, e.g. "fib(4)"',
      'root.result': 'the value this call returned, once resolved; omit while still open',
      'root.children': "this call's own recursive calls, in call order; omit/empty for a base case",
    },
    intents: ['explain', 'teach', 'howto'],
    domains: ['code', 'education'],
  }),
  createMeta('primefactortree', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'structure'],
    requires: ['title', 'number', 'nodes'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A prime-factorization tree: a non-prime number splits into its factors, recursively, until every leaf is prime (a prime leaf gets a colored ring); tidy top-down layout, never overlapping. The full factorization line under the tree is computed from the leaves themselves. Use for teaching factor trees, "factor this number", a number-theory walkthrough.',
    // No `itemShapes`: `nodes` holds ONE recursive PrimeFactorNode (the root), not a flat item
    // array — same reasoning as recursiontree's `root` above. The recursive `children` are
    // laid out by the component itself.
    propHints: {
      nodes: 'a one-element array holding the root PrimeFactorNode: { value, isPrime, children? }',
      'nodes[].children':
        "this non-prime value's factor pair (or more); omit/empty once value is prime",
    },
    intents: ['explain', 'teach', 'howto'],
    domains: ['education'],
  }),
  createMeta('nnarchitecture', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'structure', 'flow'],
    requires: ['title', 'layers'],
    optional: ['icon', 'iconColor', 'connections', 'highlight', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 9,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A layered neural-network diagram: one column of nodes per layer, edges drawn only between adjacent layers (dense or a lighter sparse band). A wide layer is capped at a readable visual maximum with a "+N more" indicator rather than one dot per unit. An optional single-unit highlight traces what feeds it and what it feeds forward. Use for "draw a 3-layer MLP", "what does this network architecture look like", explaining forward pass and layer width.',
    itemShapes: [{ prop: 'layers', text: 'name', textAliases: ['label', 'id'] }],
    propHints: {
      'layers[].units':
        'unit count for that layer; very wide layers are capped visually, never rendered one dot per unit',
      'layers[].activation': 'e.g. "ReLU", "softmax" — shown under the layer',
      connections:
        "'dense'|'sparse' — dense connects every visible node to every next-layer node, sparse a lighter local band. Default dense.",
      'highlight.layer': '0-based index into layers',
      'highlight.unit': "0-based index into that layer's units",
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'education', 'science'],
  }),
  createMeta('synthesisroute', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure', 'sequence'],
    requires: ['title', 'nodes', 'edges'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.83,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A multi-step chemical synthesis route: compound nodes auto-laid-out left-to-right by graph rank, supporting real branching — several precursors converging into one product, or one intermediate fanning out into several targets — which a single linear reaction-mechanism block cannot express. Each arrow carries its reagents/conditions above and a yield percentage below; a retrosynthetic disconnection (direction retro) draws as a dashed hollow arrow. Use for a total-synthesis route, a convergent synthesis, retrosynthetic analysis.',
    itemShapes: [
      {
        prop: 'nodes',
        text: 'label',
        textAliases: ['name', 'compound', 'formula'],
        requiredFields: ['id'],
      },
      { prop: 'edges', requiredFields: ['from', 'to'] },
    ],
    propHints: {
      'nodes[].id': 'unique nonblank id within this block',
      'nodes[].label':
        'compound name or formula; plain text (SVG), use unicode subscripts like "C₆H₆" rather than HTML markup',
      'nodes[].smiles': 'optional SMILES string, shown as a small line under the label',
      'nodes[].role': "'start'|'intermediate'|'target'",
      'edges[].reagents': 'reagent(s) driving this step, e.g. "PhMgBr" — shown above the arrow',
      'edges[].conditions': 'e.g. "THF, 0°C" — shown above the arrow alongside reagents',
      'edges[].yieldPct': 'isolated yield for this step, 0..100 — shown below the arrow',
      'edges[].direction':
        "'forward'|'retro' — retro draws a dashed hollow arrow FROM the target TO its precursor (a retrosynthetic disconnection); from/to follow that reasoning direction, the reverse of a forward precursor→product step. Default forward.",
      'edges[].from': 'exactly one existing nodes[].id',
      'edges[].to': 'exactly one existing nodes[].id',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('plasmidmap', {
    family: 'diagrams',
    dataShapes: ['structure', 'composition'],
    requires: ['title', 'sizeBp', 'features', 'sites'],
    optional: ['icon', 'iconColor', 'origin', 'footer'],
    interactive: false,
    wowWeight: 0.81,
    tier: 'cutting',
    colDefault: 7,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A circular plasmid vector map: the backbone is a ring where base position maps to angle (0 bp at 12 o\'clock, clockwise); genes/promoters/terminators/markers draw as colored arcs along their bp span with an optional strand arrow, restriction sites are radial tick+enzyme-name marks, and the origin of replication gets a distinct marker. Use for a cloning vector, an expression plasmid, "map this plasmid", restriction-digest planning.',
    itemShapes: [
      { prop: 'features', text: 'name' },
      { prop: 'sites', text: 'name', textAliases: ['enzyme'] },
    ],
    propHints: {
      sizeBp: 'total plasmid length in base pairs',
      'features[].startBp': 'base-pair position this feature starts at, 0..sizeBp',
      'features[].endBp': 'base-pair position this feature ends at; wraps if it crosses bp 0',
      'features[].kind': "'gene'|'promoter'|'terminator'|'marker'",
      'features[].strand': "'plus'|'minus' — draws a small directional arrowhead; omit for none",
      'sites[].posBp': 'base-pair position of the restriction site',
      'sites[].cutsOnce': 'true for a unique (single-cut) site',
      'origin.posBp': 'base-pair position of the origin of replication',
    },
    intents: ['explain', 'reference'],
    domains: ['science', 'education'],
  }),
  // diagrams — argument/philosophy
  createMeta('argumentmap', {
    family: 'diagrams',
    dataShapes: ['comparison', 'text'],
    requires: ['title', 'claim', 'premises'],
    optional: ['icon', 'iconColor', 'verdict', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'An argument map — a central claim with supporting premises, objections, and qualifiers. Use for "analyze this argument", "pros and cons", policy debates, or Socratic dialogue.',
    itemShapes: [{ prop: 'premises', text: 'text', textAliases: ['premise', 'point', 'reason'] }],
    propHints: {
      'premises[].type': '"support"|"objection"|"qualifier"',
    },
  }),
  createMeta('toulmin', {
    family: 'diagrams',
    // The full Toulmin model, distinct from argumentmap: the six named roles of a formal argument
    // (claim, grounds, warrant, backing, qualifier, rebuttal). Reached when the ask names those
    // roles specifically, which support/objection/qualifier would flatten.
    dataShapes: ['comparison', 'text', 'relationship'],
    requires: ['claim', 'grounds', 'warrant'],
    optional: ['title', 'icon', 'iconColor', 'backing', 'qualifier', 'rebuttal', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A Toulmin argument diagram — the six roles of a full argument: Claim, Grounds (evidence), Warrant (the link), Backing (support for the warrant), Qualifier (degree of certainty), Rebuttal (the exception). Use for "break this argument down with the Toulmin model", "what are the grounds and warrant here?". Reads Grounds → Warrant/Backing → (Qualifier) Claim, with the Rebuttal branching off. Prefer over argumentmap only when the ask names the Toulmin roles.',
    propHints: {
      claim: 'the conclusion the argument tries to establish',
      grounds: 'the data / evidence the claim rests on',
      warrant: 'the general principle linking the grounds to the claim ("since …")',
      backing: 'optional support for the warrant itself ("on account of …")',
      qualifier: 'optional degree of certainty, e.g. "presumably", "almost certainly"',
      rebuttal: 'optional condition under which the claim would NOT hold ("unless …")',
    },
    intents: ['explain', 'reference'],
    domains: ['education'],
  }),
  createMeta('castmap', {
    family: 'diagrams',
    // Relationship constellation, distinct from a plain network: named people/entities on an
    // auto-laid ring with TYPED edges whose kind drives the colour, and factions that tint and
    // cluster the nodes. Reached for "who relates to whom" in a cast, an org, or a stakeholder web.
    dataShapes: ['relationship', 'hierarchy'],
    requires: ['nodes', 'links'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.84,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A character / relationship map — people (or entities) as nodes on a ring, joined by typed, labeled edges (ally, rival, family, love, mentor, betrays). Use for a novel or show cast, factions and alliances, an org or stakeholder web. Unlike a plain network, the edge KIND drives the color and factions tint and cluster the nodes.',
    itemShapes: [{ prop: 'nodes', text: 'name', textAliases: ['label', 'character', 'person'] }],
    propHints: {
      'nodes[].id': 'stable id the links reference',
      'nodes[].role': 'optional one-line role/title under the name, e.g. "protagonist"',
      'nodes[].faction':
        'optional group/side name; same-faction nodes share a tint and cluster on the ring',
      'links[].kind':
        "'ally'|'rival'|'family'|'love'|'mentor'|'betrays'|'other' (drives the edge color; mentor/betrays are drawn directed)",
      'links[].label':
        'optional short relationship word drawn on the edge, e.g. "married", "rivals"',
      links: 'from/to reference node ids; an edge to a missing id is dropped',
    },
    intents: ['explain', 'reference', 'reflect'],
    domains: ['education', 'business'],
  }),
  createMeta('probabilitytree', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'flow'],
    requires: ['title', 'branches'],
    optional: ['icon', 'iconColor', 'note'],
    interactive: false,
    wowWeight: 0.84,
    tier: 'frontier',
    colDefault: 10,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'A branching probability tree for sequential events. Shows each branch with its probability and computed leaf outcomes. Use for genetics, decision analysis, conditional probability, and Bayesian reasoning.',
    propHints: {
      'branches[].label': 'first-level event label, e.g. "Heads"',
      'branches[].prob': 'probability 0–1, e.g. 0.5',
      'branches[].children': 'array of {label, prob, outcome?} leaf nodes',
    },
  }),
  createMeta('datastructure', {
    family: 'diagrams',
    dataShapes: ['structure', 'hierarchy', 'sequence', 'list'],
    requires: ['title', 'kind'],
    optional: ['icon', 'iconColor', 'cells', 'nodes', 'level', 'pointers', 'highlight', 'footer'],
    interactive: false,
    wowWeight: 0.83,
    tier: 'frontier',
    colDefault: 10,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'CS data-structure diagram: arrays/linked lists/stacks/queues as cells, or a binary tree/BST/heap laid out from the data. Pick for "show me a BST", "how a queue works", algorithm walkthroughs.',
    itemShapes: [{ prop: 'nodes', text: 'value', textAliases: ['val', 'key', 'label'] }],
    propHints: {
      kind: "'array'|'linkedlist'|'stack'|'queue'|'tree'|'bst'|'heap'",
      cells: 'ordered values for linear kinds; stack index 0 = bottom, queue index 0 = front',
      'nodes[]': '{id, value, left?, right?} for tree/bst/heap; left/right reference child ids',
      level: 'level-order array form of a binary tree (2i+1 / 2i+2 are children; null = hole)',
      'pointers[]': '{index, label} markers above array cells, e.g. {index:2,label:"i"}',
      highlight: 'index (linear) or node id (tree) of the element to spotlight',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'education'],
  }),
  // — diagrams additions (long-tail academic) —
  createMeta('causationchain', {
    family: 'diagrams',
    dataShapes: ['relationship', 'flow', 'hierarchy'],
    requires: ['title', 'event', 'causes', 'consequences'],
    optional: ['icon', 'iconColor', 'causesLabel', 'consequencesLabel', 'footer'],
    interactive: false,
    wowWeight: 0.83,
    tier: 'frontier',
    colDefault: 10,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'A causation chain — multiple causes → a central event → multiple consequences, read left→right, with short-term vs long-term grouping and connectors weighted by strength. Use for the causes & effects of a historical event/war/revolution, root-cause analysis, or policy impact. Unlike a generic node/edge flow graph, this is specifically the cause→event→effect shape.',
    itemShapes: [
      { prop: 'causes', text: 'label', textAliases: ['cause', 'factor', 'driver', 'name'] },
      {
        prop: 'consequences',
        text: 'label',
        textAliases: ['consequence', 'effect', 'result', 'name'],
      },
    ],
    propHints: {
      'event.label': 'the pivotal central event everything points to / flows from',
      'causes[].weight': 'relative strength 0..1 (thicker, more opaque connector); default 0.5',
      'causes[].term': '"short"|"long" — short- vs long-term horizon; omit if unclassified',
      'consequences[].weight': 'relative strength 0..1; default 0.5',
      'consequences[].term': '"short"|"long"; omit if unclassified',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['education', 'business'],
  }),
  createMeta('protocolstack', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'flow', 'structure'],
    requires: ['layers'],
    optional: ['title', 'icon', 'iconColor', 'packet', 'caption', 'footer'],
    interactive: true,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Layered network/protocol stack (OSI / TCP-IP) beside a packet-encapsulation view; layers carry protocol chips, headers nest around the payload.',
    itemShapes: [
      { prop: 'layers', text: 'name', textAliases: ['label', 'layer', 'title'] },
      { prop: 'packet', text: 'header', textAliases: ['label', 'name', 'segment'] },
    ],
    propHints: {
      layers: 'top of the array = top of the model (Application); last = link/physical',
      'layers[].protocols':
        'array of protocol/standard names rendered as chips, e.g. ["HTTP","DNS"]',
      packet:
        'encapsulation headers, OUTERMOST first → innermost payload last, e.g. Ethernet, IP, TCP, HTTP, Data',
      'packet[].layer': 'matches a layers[].name so hovering a band lights its header',
    },
    domains: ['tech', 'code'],
    intents: ['explain', 'reference'],
  }),
  createMeta('wiringdiagram', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure', 'relationship'],
    requires: ['nodes', 'wires'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Residential/automotive one-line wiring diagram drawn with real trade symbols (breaker, switch, 3-way, GFCI, outlet, light, panel); wires are color-coded by conductor (hot/neutral/ground/traveler) with gauge labels. Auto-laid out on a grid when x/y are omitted. Use for wiring a circuit, a 3-way switch loop, a GFCI-protected outlet, a service-panel one-line.',
    itemShapes: [
      {
        prop: 'nodes',
        text: 'label',
        textAliases: ['name', 'id', 'device'],
        requiredFields: ['id', 'kind'],
        closedVocabFields: ['kind'],
      },
      { prop: 'wires', requiredFields: ['from', 'to'] },
    ],
    propHints: {
      'nodes[].id': 'unique nonblank id within this block',
      'nodes[].kind':
        "'breaker'|'switch'|'switch3way'|'outlet'|'gfci'|'light'|'panel'|'motor'|'ground'|'junction'",
      'nodes[].x': 'optional position 0..100 on the canvas; omit to auto-grid',
      'nodes[].y': 'optional position 0..100 on the canvas; omit to auto-grid',
      'wires[].conductor': "'hot'|'neutral'|'ground'|'traveler' — colors the run (default 'hot')",
      'wires[].gauge': 'wire gauge label, e.g. "12 AWG"',
      'wires[].from': 'exactly one existing nodes[].id',
      'wires[].to': 'exactly one existing nodes[].id',
    },
    domains: ['tech', 'science'],
    intents: ['explain', 'howto', 'reference'],
  }),
  createMeta('pipingschematic', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure', 'relationship'],
    requires: ['components', 'lines'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'P&ID-lite piping/HVAC/hydraulic flow schematic; standard process glyphs (tank, pump, valve, heater, filter, instrument, fitting) joined by routed lines with optional flow-direction arrows and line-size labels. Auto-laid out on a grid when coords are absent. Use for a heating loop, a pump-and-filter circuit, a closed-loop HVAC diagram.',
    itemShapes: [
      {
        prop: 'components',
        text: 'label',
        textAliases: ['name', 'id', 'tag'],
        requiredFields: ['id', 'kind'],
        closedVocabFields: ['kind'],
      },
      { prop: 'lines', requiredFields: ['from', 'to'] },
    ],
    propHints: {
      'components[].id': 'unique nonblank id within this block',
      'components[].kind': "'pipe'|'valve'|'pump'|'tank'|'heater'|'filter'|'fitting'|'sensor'",
      'components[].x': 'optional position 0..100; omit to auto-grid',
      'components[].y': 'optional position 0..100; omit to auto-grid',
      'lines[].flow': 'true to draw a flow-direction arrowhead toward `to`',
      'lines[].size': 'line-size label, e.g. "DN50" or 2 inch',
      'lines[].from': 'exactly one existing components[].id',
      'lines[].to': 'exactly one existing components[].id',
    },
    domains: ['tech', 'science'],
    intents: ['explain', 'reference'],
  }),
  createMeta('logicgates', {
    family: 'diagrams',
    dataShapes: ['flow', 'structure', 'relationship'],
    requires: ['inputs', 'gates'],
    optional: ['title', 'icon', 'iconColor', 'output', 'truth', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Digital-logic circuit of standard gate symbols (AND/OR/NOT/NAND/NOR/XOR/XNOR) wired input to output; signal values are shown on wires (green=1, muted=0) and an optional adjacent truth table highlights the live input row. Gate outputs are evaluated from the inputs. Use for a half-adder, a multiplexer from gates, explaining XOR/NAND.',
    itemShapes: [{ prop: 'inputs', text: 'label', textAliases: ['name', 'id', 'signal'] }],
    propHints: {
      'inputs[].value': '0|1 — current logic level on this input (default 0)',
      'gates[].kind': "'AND'|'OR'|'NOT'|'NAND'|'NOR'|'XOR'|'XNOR'",
      'gates[].inputs': 'array of source ids (each an input id or another gate id)',
      'output.from': 'the gate or input id wired to the output pin',
      truth: 'optional rows: { row:[0,1,...] in inputs order, out:0|1 }',
    },
    domains: ['code', 'tech'],
    intents: ['explain', 'reference'],
  }),
  createMeta('algorithmtrace', {
    family: 'diagrams',
    dataShapes: ['sequence', 'code', 'structure'],
    requires: ['values', 'steps'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: true,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Interactive step-through of an algorithm over an array; a prev/next stepper recolors highlighted/compared/swapped cells and draws labeled pointer carets (i, j, lo, hi) under cells with a per-step caption. Use for tracing bubble sort, binary search, two-pointer walks, an algorithm walkthrough.',
    itemShapes: [{ prop: 'steps', text: 'caption', textAliases: ['label', 'description', 'note'] }],
    propHints: {
      values: 'the array the algorithm runs over (numbers or short strings)',
      complexity:
        "'o-1'|'o-logn'|'o-n'|'o-nlogn'|'o-n2'|'o-2n' — time-complexity badge shown next to the title",
      'steps[].highlight': 'array of 0-based indices to emphasize (the active window)',
      'steps[].compare': 'array of indices being compared this step',
      'steps[].swapped': 'array of indices swapped this step',
      'steps[].pointer':
        'object of named pointers to the index they sit under, e.g. { i: 2, j: 3, lo: 0, hi: 6 }',
    },
    domains: ['code'],
    intents: ['explain'],
  }),
  createMeta('dptable', {
    family: 'diagrams',
    dataShapes: ['tabular', 'structure', 'sequence'],
    requires: ['rows', 'cols', 'cells'],
    optional: ['title', 'icon', 'iconColor', 'recurrence', 'steps', 'highlight', 'path', 'footer'],
    interactive: true,
    wowWeight: 0.85,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A 2-D dynamic-programming memoization table with interactive step-through: each step highlights the cell being computed (presence tint) and its recurrence dependencies (insight tint). Use for LCS, edit distance, knapsack, coin change — any DP problem where seeing the table fill in is the "aha" moment. The model supplies rows/cols/cells (the full grid) plus an optional recurrence formula and ordered steps. Never for a plain data table (use datatable).',
    itemShapes: [{ prop: 'steps', text: 'caption', textAliases: ['label', 'description'] }],
    propHints: {
      rows: 'row header labels, e.g. ["", "A", "B", "C"] — include a corner sentinel as needed',
      cols: 'column header labels, e.g. ["", "0", "1", "2", "3"]',
      cells: '2-D array cells[row][col]; null = unfilled. Provide the fully-filled final grid.',
      recurrence: 'recurrence formula shown above the table, e.g. "dp[i][j] = dp[i-1][j-1]+1"',
      'steps[].current': '[row, col] 0-based index of the cell being computed (presence tint)',
      'steps[].deps': 'array of [row, col] pairs this step reads from (insight tint)',
      'steps[].caption': 'what is happening at this step',
    },
    domains: ['code', 'math', 'education'],
    intents: ['explain', 'teach'],
    stringItems: ['rows', 'cols'],
  }),
  createMeta('cyclewheel', {
    family: 'diagrams',
    // The closed-loop primitive: stages ring a circle with curved arrows flowing one into the
    // next and back to the start. Tagged for cyclical processes specifically — distinct from a
    // one-directional diagramflow/pipeline — so the selector reaches for it on a natural,
    // biological, or economic cycle the loop-never-ends shape is the point of.
    dataShapes: ['flow', 'sequence', 'relationship'],
    requires: ['stages'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'An illustrated closed loop — 3-8 stages spaced evenly around a ring, each an icon + label + short caption, joined by curved arrows that flow one into the next and back to the first. Use for the water cycle, a butterfly/cell life cycle, the carbon/nitrogen/rock cycle, a product or feedback loop. Unlike a one-directional flow, the loop closes back to the start.',
    itemShapes: [
      { prop: 'stages', text: 'label', textAliases: ['name', 'stage', 'phase', 'step'] },
    ],
    propHints: {
      stages: 'in loop order; the last stage arcs back to the first (3-8 read best)',
      'stages[].caption': 'optional one-line gloss of what happens at this stage',
      'stages[].icon':
        "optional glyph key, e.g. 'sun'|'cloud'|'rain'|'globe'; falls back to a numbered token",
    },
    intents: ['explain', 'reference'],
    domains: ['science', 'nature'],
  }),
  createMeta('hashtable', {
    family: 'diagrams',
    dataShapes: ['structure', 'list', 'relationship'],
    requires: ['size', 'entries'],
    optional: ['title', 'icon', 'iconColor', 'hashFn', 'highlight', 'footer'],
    interactive: false,
    wowWeight: 0.83,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A hash table with separate-chaining collision resolution: a vertical bucket array on the left, horizontal linked-list chains extending right from each non-empty bucket, with the hash function label above. Use for "how does a hash map work", collision walkthroughs, load-factor discussions. The component auto-hashes keys unless an explicit bucket index is given. Never for a plain key-value list.',
    propHints: {
      size: 'number of buckets in the table, e.g. 7 (capped at 8 visually)',
      entries: 'key-value pairs: [{ key, value?, bucket? }]',
      hashFn: 'display label for the hash function, e.g. "h(k) = k mod 7"',
      highlight: 'the key to spotlight (presence accent) in its chain',
      'entries[].bucket': 'optional explicit 0-based bucket index; otherwise auto-computed',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'education'],
  }),
  createMeta('trie', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'structure', 'sequence'],
    requires: ['words'],
    optional: ['title', 'icon', 'iconColor', 'highlight', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A prefix tree (trie) drawn from a list of words: each edge carries its character, end-of-word nodes get a double ring, and an optional highlight word traces the full insertion path from root to leaf in the presence accent. Use for "how does autocomplete work", "show a prefix tree for these words", trie algorithm interview walkthroughs. Never for a binary tree — use binarytree for that.',
    propHints: {
      words: 'words to insert into the trie (max ~10 short words for readability)',
      highlight: 'the word whose path from root to leaf to trace in the presence accent',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'education'],
    stringItems: ['words'],
  }),
  createMeta('graphtrace', {
    family: 'diagrams',
    dataShapes: ['structure', 'sequence', 'relationship'],
    requires: ['nodes', 'edges', 'steps'],
    optional: ['title', 'icon', 'iconColor', 'algorithm', 'footer'],
    interactive: true,
    wowWeight: 0.86,
    tier: 'frontier',
    colDefault: 10,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'Interactive BFS/DFS step-through on a graph: nodes colour-coded by traversal state — current (presence), frontier/queue (warning), visited (muted), unvisited (default) — with Prev/Next controls and a live queue/stack panel. Use for "walk me through BFS", "show DFS step by step". Never for a static graph — use network; for array-algorithm step-throughs use algorithmtrace.',
    itemShapes: [{ prop: 'nodes', text: 'label', textAliases: ['id', 'name'] }],
    propHints: {
      'nodes[]': '{ id, label?, x?, y? } — x/y in 0..100 units; omit to auto-ring',
      'edges[]': '{ from, to, weight?, directed? }',
      'steps[]': '{ caption, current?, visited?, frontier? } — ids of nodes in each state',
      algorithm: "'bfs' (default, shows Queue:) or 'dfs' (shows Stack:)",
    },
    intents: ['explain', 'teach', 'howto'],
    domains: ['code', 'education'],
  }),
  createMeta('binarytree', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'structure', 'sequence'],
    requires: ['nodes', 'root'],
    optional: ['title', 'icon', 'iconColor', 'steps', 'caption', 'footer'],
    interactive: true,
    wowWeight: 0.87,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A binary tree with optional interactive step-through traversal: nodes are laid out via inorder x-position + depth y (tidy-tree geometry, never overlapping). An optional steps array drives a Prev/Next stepper that re-colours nodes — visiting (presence), visited (muted), found (insight) — and shows a BFS queue / DFS stack plus an accumulating traversal result. Use for "trace BST search", "show inorder/preorder traversal", "walk me through BFS on a tree", heap diagrams, and FAANG tree interview walkthroughs. Never for a general graph — use graphtrace; for a node-link diagram use datastructure.',
    // `value` is numeric and `id` is a structural reference, not interchangeable visible-text
    // aliases. The concrete example + prop hint teach the full node contract instead.
    propHints: {
      nodes: '{ id, value, left?, right? } — left/right are node ids; order does not matter',
      root: 'id of the root node',
      'steps[].states': 'map of node id → "default"|"visiting"|"visited"|"found"|"highlight"',
      'steps[].frontier': 'queue or stack contents at this step (node value labels)',
      'steps[].result': 'accumulated traversal result so far (node value labels)',
      'steps[].caption': 'what is happening in this step',
    },
    intents: ['explain', 'teach', 'howto'],
    domains: ['code', 'education'],
  }),
  createMeta('sortingviz', {
    family: 'diagrams',
    dataShapes: ['sequence', 'structure'],
    requires: ['algorithm', 'values', 'steps'],
    optional: ['title', 'icon', 'iconColor', 'complexity', 'footer'],
    interactive: true,
    wowWeight: 0.88,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Animated bar-chart sorting visualizer: each step carries a full array snapshot so bars change height and colour at every algorithm step — compared (warning), swapped (insight), sorted (presence), pivot (danger for quicksort). Play/pause + 3 speed levels; comparison + swap counters. Use for "show bubble sort", "walk me through merge sort", "compare sorting algorithms". Never for a static array (use algorithmtrace).',
    itemShapes: [{ prop: 'steps', text: 'caption', textAliases: ['label', 'description'] }],
    propHints: {
      algorithm: 'human-readable algorithm name, e.g. "Bubble Sort" or "Quick Sort"',
      complexity: "'o-1'|'o-logn'|'o-n'|'o-nlogn'|'o-n2'|'o-2n' — shown as a badge",
      values: 'initial array (used when steps is empty for static display)',
      'steps[].values': 'full array snapshot at this step (drives bar heights)',
      'steps[].compared': 'indices being compared (warning accent)',
      'steps[].swapped': 'indices just swapped (insight accent)',
      'steps[].sorted': 'indices confirmed in final position (presence, permanent)',
      'steps[].pivot': 'pivot index for quicksort (danger accent)',
    },
    intents: ['explain', 'teach', 'howto'],
    domains: ['code', 'education'],
  }),
  createMeta('gridtrace', {
    family: 'diagrams',
    dataShapes: ['sequence', 'structure'],
    requires: ['steps'],
    optional: ['title', 'icon', 'iconColor', 'algorithm', 'rows', 'cols', 'footer'],
    interactive: true,
    wowWeight: 0.89,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A 2-D grid visualizer for BFS/DFS, flood-fill, and grid-DP problems. Each step carries a full grid snapshot where every cell is coloured by state: empty (white), wall (dark), start (presence), end (insight), current (presence bright), queued/in-queue (warning), visited (muted), path (insight). Optional value labels show distances or costs. Play/pause + 3 speeds. Use for "BFS shortest path on a grid", "island counting", "flood fill", "word search", "rotting oranges", any grid-based FAANG interview problem. Never for a general graph without a grid structure (use graphtrace).',
    itemShapes: [{ prop: 'steps', text: 'caption', textAliases: ['label', 'description'] }],
    propHints: {
      algorithm: 'algorithm label shown in badge, e.g. "BFS", "DFS", "Flood Fill"',
      'steps[].grid':
        '2-D array (rows × cols) of {state, value?} — state is one of: empty|wall|start|end|current|queued|visited|path',
      'steps[].grid[r][c].state':
        "'empty'|'wall'|'start'|'end'|'current'|'queued'|'visited'|'path'",
      'steps[].grid[r][c].value': 'optional label (distance, cost, character, 0/1)',
    },
    intents: ['explain', 'teach', 'howto'],
    domains: ['code', 'education'],
  }),
  createMeta('tournamentbracket', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'sequence', 'ranking'],
    requires: ['title', 'rounds', 'matchups'],
    optional: ['icon', 'iconColor', 'double', 'footer'],
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 12,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'A single-elimination tournament bracket: one column per round, joined by SVG elbow connectors — every matchup\'s position is computed from its round + slot (never authored), so it self-centers automatically as rounds advance. A decided matchup bolds and tints the winner\'s name and mutes the loser\'s; an open slot shows "TBD", a walkover shows "BYE". Use for "show the bracket", playoff brackets, single-elimination sports/esports draws, and elimination-style debate or business-case competitions. SHIPS SINGLE-ELIMINATION ONLY this pass — `double` is a reserved prop for a future losers-bracket rendering; setting it true only labels the view, it does NOT draw a losers bracket, so never promise one from it. Never for a round-robin or league table — use standings or leaderboard for that.',
    // No itemShapes for `matchups`: each item carries TWO independent text fields (a, b) and
    // either may legitimately be absent (a bye, a not-yet-decided later-round slot) — the
    // generic coercer's single text-field alias+drop behaviour would corrupt or discard valid
    // matchups, so this is taught entirely through propHints instead (same call as erdiagram's
    // join-keyed `relationships`).
    propHints: {
      rounds: 'round names in order, e.g. ["Round of 16", "Quarterfinal", "Semifinal", "Final"]',
      'matchups[].round': '0-based index into rounds — which column this matchup sits in',
      'matchups[].slot': '0-based position within the round, top to bottom',
      'matchups[].a': 'first competitor; omit for a not-yet-decided slot',
      'matchups[].b': 'second competitor; omit for a bye or not-yet-decided slot',
      'matchups[].winner': '"a" or "b" once the matchup is decided; omit while pending',
      double:
        'reserved for a future losers-bracket view — leave false; setting it true does not render one',
    },
    intents: ['track', 'reference'],
    domains: ['sports', 'business', 'education'],
    stringItems: ['rounds'],
  }),
  createMeta('prooftree', {
    family: 'diagrams',
    dataShapes: ['hierarchy', 'structure'],
    requires: ['title', 'steps'],
    optional: ['icon', 'iconColor', 'conclusionId', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 9,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A Gentzen-style natural-deduction proof tree: premises stack above an inference bar with the rule name at its right, the conclusion sits below, and a bracketed leaf like "[P]" renders as a discharged assumption. Built from a FLAT steps list — each step cites the ids it is inferred from — and the tree assembles and centres itself. Use for propositional/predicate-logic derivations, "prove Q ∧ R from these premises", natural-deduction or sequent-calculus homework. Never for geometry statements/reasons proofs — use twocolumnproof.',
    itemShapes: [{ prop: 'steps', text: 'statement', textAliases: ['text', 'formula', 'sequent'] }],
    propHints: {
      'steps[].id': 'stable id other steps cite in their from lists',
      'steps[].statement':
        'the formula this line asserts, e.g. "P → Q"; wrap a discharged assumption in square brackets, e.g. "[P]"',
      'steps[].rule': "the inference rule shown at the bar, e.g. '∧I', '→E', 'MP', 'RAA'",
      'steps[].from':
        'ids of the premise steps this line follows from; omit for a leaf premise/assumption',
      conclusionId: 'id of the final conclusion; defaults to the step no other step cites',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['education', 'math'],
  }),
  createMeta('fishbone', {
    family: 'diagrams',
    dataShapes: ['relationship', 'structure'],
    requires: ['title', 'effect', 'categories'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'An Ishikawa fishbone cause-effect diagram: the effect sits in a head box at the right of a horizontal spine, category ribs alternate above and below at ~60°, and each rib carries its causes as short twigs. Categories are whatever the analysis used — the classic 6M set or any custom grouping, up to 8 ribs. Use for "why does this defect keep happening", a quality-control teardown, a project retro on a recurring failure. Never for a linear why chain — use fivewhychain. Never for a MECE breakdown tree — use issuetree.',
    itemShapes: [{ prop: 'categories', text: 'label', textAliases: ['name', 'category', 'title'] }],
    // `categories[].causes` is an array of PLAIN STRINGS nested inside items — taught via the
    // hint below (protocolstack's `layers[].protocols` precedent); a text-bearing child spec
    // would objectify the strings, the exact failure the render-invariant guards against.
    propHints: {
      effect: 'the problem/outcome under investigation, shown in the head box at the right',
      'categories[].causes':
        'array of short cause phrases drawn as twigs off the rib, most prominent first (2-5 read best)',
    },
    intents: ['explain', 'reflect', 'decide'],
    domains: ['business', 'education', 'tech'],
  }),
  createMeta('classdiagram', {
    family: 'diagrams',
    dataShapes: ['structure', 'relationship'],
    requires: ['title', 'classes', 'relations'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.84,
    tier: 'frontier',
    colDefault: 12,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'A UML class diagram: class boxes with the three standard compartments (name with an italic «stereotype», fields, methods), auto-layered so parents sit above their subclasses, joined with proper UML arrowheads — hollow triangle for inheritance (dashed when implements), filled diamond for composition, hollow diamond for aggregation, dashed open arrow for dependency, plain line for association. Use for "diagram these classes", OOP design teaching, design-pattern structure (Strategy, Observer), refactoring discussions. Never for database tables and relationships — use erdiagram.',
    itemShapes: [{ prop: 'classes', text: 'name', textAliases: ['label', 'class', 'title'] }],
    // `classes[].fields` / `classes[].methods` are arrays of PLAIN STRINGS nested inside items,
    // taught via the hints below — same reasoning as fishbone's `categories[].causes`.
    propHints: {
      'classes[].name': 'the class name — also the key relations reference in from/to',
      'classes[].stereotype': "'interface' | 'abstract' | 'enum' — omit for a concrete class",
      'classes[].fields': 'field lines as plain strings, e.g. "+ radius: number"',
      'classes[].methods': 'method lines as plain strings, e.g. "+ area(): number"',
      'relations[].kind':
        "'inheritance' | 'implements' | 'composition' | 'aggregation' | 'association' | 'dependency'",
      'relations[].from':
        'the child/client class for inheritance, implements, and dependency; the WHOLE (diamond end) for composition/aggregation',
      'relations[].to':
        'the parent for inheritance/implements (triangle end), the part for composition/aggregation, the supplier for dependency',
      'relations[].label': 'optional short caption at the line midpoint, e.g. a multiplicity',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['code', 'education'],
  }),
  createMeta('analogymap', {
    family: 'diagrams',
    dataShapes: ['relationship', 'text', 'comparison'],
    // A bipartite correspondence figure, not a scored comparison table — cluster it with the
    // node/edge diagrams so it is never deduped against comparematrix in a menu.
    archetype: 'graph',
    requires: ['title', 'familiar', 'target', 'pairs'],
    optional: ['icon', 'iconColor', 'breaksDown', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    // Domain-neutral on purpose: an analogy is how you explain an unfamiliar thing in ANY field.
    blurb:
      'An analogy map: the familiar thing on the left, the concept being explained on the right, and one labelled correspondence line per mapped part ("your house key" → "the private key: the secret you never share"), plus an explicit `breaksDown` panel naming where the analogy stops holding. Use when an ask is "explain X like I already know Y", "what\'s a good analogy for X", or any first encounter with an abstract concept that has no literal shape to draw — exactly the case teachdiagram refuses. Unlike frayermodel (which explains a term on its own terms) this block\'s whole job is the bridge to PRIOR knowledge; unlike comparematrix it is not scoring two options against criteria, it is asserting that part-for-part they correspond.',
    itemShapes: [
      {
        prop: 'pairs',
        text: 'familiar',
        textAliases: ['known', 'source', 'analog', 'from', 'left'],
        // Both halves or nothing: a pair with no target draws a correspondence line to nothing.
        requiredFields: ['target'],
      },
    ],
    stringItems: ['breaksDown'],
    propHints: {
      familiar: 'the familiar domain the analogy borrows from, e.g. "A house and its keys"',
      target: 'the unfamiliar concept being explained, e.g. "Public-key cryptography"',
      'pairs[].familiar': 'the part of the FAMILIAR thing, e.g. "Your house key"',
      'pairs[].target': 'the part of the concept it maps onto, e.g. "The private key"',
      'pairs[].note':
        'optional short gloss of what the correspondence IS, drawn on the connector, e.g. "the secret you never hand out"',
      'pairs[].loose':
        'optional true when the match is only approximate — the connector draws dashed rather than overstating it',
      breaksDown:
        'plain strings naming where the analogy fails, e.g. "A house key can be copied from a photo; a private key cannot be derived from the public one." Include it whenever the analogy could leave a wrong mental model.',
    },
    intents: ['explain', 'teach'],
  }),
];
