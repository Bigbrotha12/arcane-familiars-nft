import { Link } from 'react-router-dom'
import Button from '../ui/Button'

interface NavProps {
  onConnectWallet?: () => void
  connected?: boolean
  address?: string
}

function Nav({ onConnectWallet, connected, address }: NavProps) {
  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  return (
    <nav className="sticky top-0 z-40 bg-surface-primary/90 backdrop-blur-md border-b border-border">
      <div className="max-w-content mx-auto flex items-center justify-between px-lg py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-display font-semibold text-text-primary">
            Arcane Familiars
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-text-secondary hover:text-text-primary transition-colors font-body text-sm">
            Home
          </Link>
          <Link to="/app/game" className="text-text-secondary hover:text-text-primary transition-colors font-body text-sm">
            Play
          </Link>
          <Link to="/app/collection" className="text-text-secondary hover:text-text-primary transition-colors font-body text-sm">
            Collection
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {connected ? (
            <Button variant="secondary" size="sm">
              {displayAddress}
            </Button>
          ) : (
            <Button size="sm" onClick={onConnectWallet}>
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Nav
