import { Link } from 'react-router-dom';
import LogoMark from '@/components/layout/LogoMark';

function Footer(): JSX.Element {
  const routeLinks = [
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Credits', to: '/credits' },
  ];

  const linkClass =
    'rounded-sm text-sm font-body text-text-muted transition-colors hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-alt';

  return (
    <footer className="mt-auto border-t border-border bg-surface-alt">
      <div className="mx-auto max-w-content px-md py-xl sm:px-lg">
        <div className="flex flex-col items-start gap-md md:flex-row md:items-center md:justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-alt"
          >
            <LogoMark />
            <span className="font-display text-lg font-semibold text-text-primary">Arcane Familiars</span>
          </Link>

          <div className="flex flex-wrap items-center gap-x-md gap-y-sm">
            {routeLinks.map((link) => (
              <Link key={link.label} to={link.to} className={linkClass}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-lg border-t border-border pt-md text-left font-body text-xs text-text-muted">
          &copy; {new Date().getFullYear()} Arcane Familiars. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default Footer;
