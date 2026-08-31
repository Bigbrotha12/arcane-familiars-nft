import { Link } from 'react-router-dom';

function Footer() {
  const links = [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'White Paper', href: '#' },
    { label: 'Documentation', href: '#' },
  ];

  return (
    <footer className="bg-surface-alt border-t border-border mt-auto">
      <div className="max-w-content mx-auto px-lg py-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-md">
          <span className="text-lg font-display font-semibold text-text-primary">Arcane Familiars</span>

          <div className="flex items-center gap-6">
            {links.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="text-text-muted hover:text-text-secondary transition-colors text-sm font-body"
              >
                {link.label}
              </Link>
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
