import type { ReactNode } from 'react';

const TICKED = /`([^`\n]+)`/g;

/** A model writes code inside prose the way a person does — between backticks — and a plain-text
 *  field renders those ticks verbatim. This sets each ticked span as code and leaves everything
 *  else as text nodes (never markup, so there is nothing to sanitize). An unpaired tick stays
 *  literal: `a < b` closes, a lone ` does not. */
export function withInlineCode(text: string | undefined): ReactNode {
  // The model's shape is not guaranteed, so a non-string passes through for React to render as-is.
  if (typeof text !== 'string' || !text.includes('`')) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TICKED)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <code key={match.index} className="inline-code">
        {match[1]}
      </code>,
    );
    last = match.index + match[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}
