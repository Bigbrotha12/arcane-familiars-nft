import { Link } from 'react-router-dom';

function Footer() {
  const routeLinks = [
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Terms of Service', to: '/terms' },
  ];

  const placeholderLinks = [
    { label: 'White Paper', href: '#' },
    { label: 'Documentation', href: '#' },
  ];

  const linkClass = 'text-text-muted hover:text-text-secondary transition-colors text-sm font-body';

  return (
    <footer className="bg-surface-alt border-t border-border mt-auto">
      <div className="max-w-content mx-auto px-lg py-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-md">
          <span className="text-lg font-display font-semibold text-text-primary">Arcane Familiars</span>

          <div className="flex items-center gap-6">
            {routeLinks.map((link) => (
              <Link key={link.label} to={link.to} className={linkClass}>
                {link.label}
              </Link>
            ))}
            {placeholderLinks.map((link) => (
              <a key={link.label} href={link.href} className={linkClass}>
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-lg pt-md border-t border-border text-center text-xs text-text-muted font-body">
          &copy; {new Date().getFullYear()} Arcane Familiars. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default Footer;
