import { Link } from 'react-router-dom';
import LogoMark from '@/components/layout/LogoMark';
import Button from '@/components/ui/Button';

function Nav(): JSX.Element {
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-surface-primary/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-content items-center justify-between px-md py-3 sm:px-lg">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
        >
          <LogoMark />
          <span className="font-display text-xl font-semibold text-text-primary">Arcane Familiars</span>
        </Link>

        <div className="flex items-center gap-md sm:gap-6">
          <Link
            to="/app/collection"
            className="rounded-sm font-body text-sm text-text-secondary transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
          >
            Codex
          </Link>
          <Link
            to="/play/game"
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
          >
            <Button size="sm" tabIndex={-1}>
              Play
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Nav;
