// The favicon mark, inlined so the nav and footer can show it without a second
// network request. Kept at 28px, matching the brand lockup.

interface LogoMarkProps {
  className?: string;
}

function LogoMark({ className = '' }: LogoMarkProps): JSX.Element {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`.trim()}
    >
      <rect width="32" height="32" rx="8" fill="#7C5CFC" />
      <path d="M16 5l2.6 7.4L26 15l-7.4 2.6L16 25l-2.6-7.4L6 15l7.4-2.6z" fill="#FFF8F0" />
      <circle cx="24.5" cy="7.5" r="1.8" fill="#FBBF24" />
    </svg>
  );
}

export default LogoMark;
