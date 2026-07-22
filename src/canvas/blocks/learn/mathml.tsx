// Renders a MathNode tree to browser-native MathML — zero dependencies, accessible, and it
// inherits font-size so it scales with the fluid type system. React knows the MathML elements
// (<math>, <mfrac>, <msup>…); we just emit them. Unknown node shapes degrade to their text so a
// malformed tree never throws.
import type { DOMAttributes, ReactNode } from 'react';
import type { MathNode } from './types';

// React 19's JSX types cover HTML + SVG but not MathML, so declare the elements this renderer
// emits. With `react-jsx`, intrinsics resolve through the `react` module's JSX namespace; the
// augmentation must be co-located with the JSX that uses it to merge reliably.
type MathMLElementProps = DOMAttributes<Element> & {
  key?: string | number;
  className?: string;
  display?: 'block' | 'inline';
  'aria-label'?: string;
  children?: ReactNode;
};
declare module 'react' {
  // Augmenting React's JSX namespace is the only way to register intrinsic elements.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLElementProps;
      mrow: MathMLElementProps;
      mn: MathMLElementProps;
      mi: MathMLElementProps;
      mo: MathMLElementProps;
      mfrac: MathMLElementProps;
      msup: MathMLElementProps;
      msub: MathMLElementProps;
      msubsup: MathMLElementProps;
      msqrt: MathMLElementProps;
      mroot: MathMLElementProps;
      munder: MathMLElementProps;
      mover: MathMLElementProps;
      munderover: MathMLElementProps;
    }
  }
}

let keySeq = 0;
const nextKey = () => `m${keySeq++}`;

/** Render one node. Strings and `num`/`ident`/`op` become the right MathML token element. */
function renderNode(node: MathNode): ReactNode {
  if (typeof node === 'string') return <mn key={nextKey()}>{node}</mn>;

  switch (node.t) {
    case 'num':
      return <mn key={nextKey()}>{node.v}</mn>;
    case 'ident':
      return <mi key={nextKey()}>{node.v}</mi>;
    case 'op':
      return <mo key={nextKey()}>{node.v}</mo>;
    case 'row':
      return <mrow key={nextKey()}>{node.items.map(renderNode)}</mrow>;
    case 'frac':
      return (
        <mfrac key={nextKey()}>
          {wrap(node.num)}
          {wrap(node.den)}
        </mfrac>
      );
    case 'sup':
      return (
        <msup key={nextKey()}>
          {wrap(node.base)}
          {wrap(node.sup)}
        </msup>
      );
    case 'sub':
      return (
        <msub key={nextKey()}>
          {wrap(node.base)}
          {wrap(node.sub)}
        </msub>
      );
    case 'subsup':
      return (
        <msubsup key={nextKey()}>
          {wrap(node.base)}
          {wrap(node.sub)}
          {wrap(node.sup)}
        </msubsup>
      );
    case 'sqrt':
      return node.index !== undefined ? (
        <mroot key={nextKey()}>
          {wrap(node.arg)}
          {wrap(node.index)}
        </mroot>
      ) : (
        <msqrt key={nextKey()}>{wrap(node.arg)}</msqrt>
      );
    case 'group':
      return (
        <mrow key={nextKey()}>
          <mo>{node.open ?? '('}</mo>
          {node.items.map(renderNode)}
          <mo>{node.close ?? ')'}</mo>
        </mrow>
      );
    case 'sum':
      return bigOp('∑', node.lower, node.upper, node.arg);
    case 'int':
      return bigOp('∫', node.lower, node.upper, node.arg);
    default:
      return null;
  }
}

/** A large operator (∑ / ∫) with optional under/over bounds, followed by its argument. */
function bigOp(
  symbol: string,
  lower: MathNode | undefined,
  upper: MathNode | undefined,
  arg: MathNode,
): ReactNode {
  const op = <mo>{symbol}</mo>;
  let head: ReactNode;
  if (lower !== undefined && upper !== undefined) {
    head = (
      <munderover>
        {op}
        {wrap(lower)}
        {wrap(upper)}
      </munderover>
    );
  } else if (lower !== undefined) {
    head = <munder>{[op, wrap(lower)]}</munder>;
  } else {
    head = op;
  }
  return (
    <mrow key={nextKey()}>
      {head}
      {wrap(arg)}
    </mrow>
  );
}

/** MathML layout elements (mfrac, msup, …) expect element children; wrap a token/row in <mrow>. */
function wrap(node: MathNode): ReactNode {
  if (typeof node !== 'string' && (node.t === 'row' || node.t === 'frac' || node.t === 'group')) {
    return renderNode(node);
  }
  return <mrow key={nextKey()}>{renderNode(node)}</mrow>;
}

interface MathProps {
  node: MathNode;
  /** Block (centered, display) vs inline. */
  display?: boolean;
  /** Accessible label; falls back to a generic one. */
  label?: string;
}

/** Render a math tree as a <math> element. */
export function MathML({ node, display, label }: MathProps) {
  return (
    <math
      display={display ? 'block' : 'inline'}
      className="lr-math"
      aria-label={label ?? 'mathematical expression'}
    >
      {renderNode(node)}
    </math>
  );
}
