import Button from '../ui/Button'

function Community() {
  return (
    <section className="py-3xl bg-accent text-white">
      <div className="max-w-content mx-auto px-lg text-center">
        <h2 className="text-3xl md:text-4xl font-display font-semibold">
          Join the Arcane
        </h2>
        <p className="mt-sm text-white/80 font-body max-w-md mx-auto">
          The best battles are fought together. Join our community to trade strategies,
          show off your collection, and shape the future of Arcane Familiars.
        </p>
        <div className="mt-xl flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="secondary" size="lg" className="!bg-white !text-accent hover:!bg-white/90">
            Join Discord
          </Button>
          <Button variant="ghost" size="lg" className="!text-white hover:!bg-white/10">
            Follow on X
          </Button>
        </div>
      </div>
    </section>
  )
}

export default Community
