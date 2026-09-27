import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactElement } from 'react';

type SecretInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'> & {
  value: string;
};

/**
 * An input for a key or token. React mirrors a controlled input's value into its `value`
 * ATTRIBUTE, so a pasted key would sit in the DOM where any extension, page snapshot or CSS
 * attribute selector can read it. This writes only the live `.value` property; the attribute
 * is never set. Typing still reports through `onChange` as usual.
 */
export function SecretInput({ value, ...rest }: SecretInputProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = input.current;
    if (el && el.value !== value) el.value = value;
  }, [value]);
  return <input {...rest} ref={input} />;
}
