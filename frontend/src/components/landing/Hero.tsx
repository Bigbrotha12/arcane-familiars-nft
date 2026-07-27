import { Link } from 'react-router-dom'
import Button from '../ui/Button'

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-accent-light/30 via-surface-primary to-surface-primary">
      <div className="max-w-content mx-auto px-lg py-3xl flex flex-col items-center gap-xl">
        <div className="flex justify-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80 animate-float">
            <div className="absolute inset-0 bg-accent/10 rounded-full blur-3xl" />
            <div className="relative w-full h-full rounded-full bg-gradient-to-br from-accent-light to-accent/20 flex items-center justify-center">
              <span className="text-6xl">🐉</span>
            </div>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-text-primary leading-tight">
            Collect. Battle.{' '}
            <span className="text-accent">Earn.</span>
          </h1>
          <p className="mt-md text-lg text-text-secondary font-body max-w-lg mx-auto">
            Summon cute familiar NFTs, craft powerful abilities, and battle
            creatures in a magical world where your collection is truly yours.
          </p>
          <div className="mt-xl flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/app/game">
              <Button size="lg">Start Playing</Button>
            </Link>
            <Link to="/app/collection">
              <Button variant="secondary" size="lg">View Collection</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
