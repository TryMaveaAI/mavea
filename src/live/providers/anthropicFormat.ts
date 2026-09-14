// anthropicFormat.ts — renders a JSON Schema into the dialect Anthropic's structured
// outputs accept, or reports that a schema cannot be expressed there at all.
//
// The Messages API takes a narrower JSON Schema than the rest of Live is written against,
// and it refuses the whole request with a 400 rather than ignoring the parts it does not
// support. Four rules, each confirmed against the API:
//   1. every `object` node must set `additionalProperties: false` explicitly;
//   2. `minItems` is understood only as 0 or 1;
//   3. every node must carry a `type`;
//   4. the whole schema may declare at most 24 optional properties.
// Rule 1 is the one with teeth. `blocks[].props` in schema.ts is an OPEN object on purpose —
// a block's props are keyed by its own type — and every other provider either sends no
// schema at all (Gemini) or takes one non-strictly (the Responses adapter pins
// `strict: false` for exactly this field). Sealing it would leave the model able to emit
// `{}` and nothing else, so a schema carrying a node like that is inexpressible here: this
// returns null, the adapter sends no `output_config`, and the answer is shaped by the prompt
// and checked by validateLiveResponse on the way in — the posture Gemini has always run.
// Rule 4 is the one the living world tripped: its schema names 34 optional fields across a
// node, and the API refuses the request outright ("too many optional parameters") rather than
// compiling a looser grammar. Sent anyway, every world paid a failed round-trip before the
// adapter learned to re-ask without it — so a schema over the limit is inexpressible here too,
// and goes out unconstrained the first time.

/** Confirmed against the API: a schema declaring more optional properties than this is refused
 *  with a 400, not compiled. Counted across every object in the tree, array items included. */
export const ANTHROPIC_OPTIONAL_LIMIT = 24;

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The schema Anthropic will accept, or null when it cannot be rendered faithfully.
 *  Never mutates its input — callers hold module-level schema constants. */
export function anthropicOutputFormat(schema: object): object | null {
  const rendered = render(schema);
  if (!rendered || optionalCount(rendered) > ANTHROPIC_OPTIONAL_LIMIT) return null;
  return rendered;
}

/** How many declared properties the tree leaves optional — the number the API's limit is on. */
function optionalCount(node: Node): number {
  let n = 0;
  if (isNode(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    for (const [key, child] of Object.entries(node.properties)) {
      if (!required.has(key)) n++;
      if (isNode(child)) n += optionalCount(child);
    }
  }
  if (isNode(node.items)) n += optionalCount(node.items);
  return n;
}

function render(node: unknown): Node | null {
  if (!isNode(node) || typeof node.type !== 'string') return null;
  const out: Node = { ...node };

  if (node.type === 'object') {
    // An object with no declared properties is an open bag of fields. Sealing it — which the
    // API requires of every object — would narrow it to `{}`, so the schema goes instead.
    if (!isNode(node.properties) || Object.keys(node.properties).length === 0) return null;
    const properties: Node = {};
    for (const [key, child] of Object.entries(node.properties)) {
      const rendered = render(child);
      if (!rendered) return null;
      properties[key] = rendered;
    }
    out.properties = properties;
    out.additionalProperties = false;
  } else if (node.type === 'array' && node.items !== undefined) {
    const items = render(node.items);
    if (!items) return null;
    out.items = items;
  }

  // "At least three" is not sayable here, and saying it costs the whole request. The floor a
  // turn actually needs is stated in the prompt; keep only the part the API understands.
  if (typeof out.minItems === 'number' && out.minItems > 1) out.minItems = 1;

  return out;
}
