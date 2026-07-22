// The Mavéa wordmark as a standalone link, for any surface that needs a way home but isn't
// the topbar (which docks the real presence face onto .jelly-mark instead — see top-bar.css).
// Layout is the caller's call via className; this only owns the mark + label + a11y name.

export function BrandMark({
  href,
  label = 'Mavéa',
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <a className={className} href={href} aria-label={`${label} home`}>
      <span className="jelly-mark" />
      {label}
    </a>
  );
}
