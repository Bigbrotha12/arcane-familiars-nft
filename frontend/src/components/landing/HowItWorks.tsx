const steps = [
  { step: '1', title: 'Connect Your Wallet', desc: 'Link MetaMask or WalletConnect to get started.' },
  { step: '2', title: 'Summon a Familiar', desc: 'Mint your first familiar NFT and discover its unique traits.' },
  { step: '3', title: 'Level Up & Learn', desc: 'Battle creatures to earn XP and unlock powerful abilities.' },
  { step: '4', title: 'Trade & Earn', desc: 'Sell your familiars on the marketplace or keep building your dream team.' },
]

function HowItWorks() {
  return (
    <section className="py-3xl">
      <div className="max-w-content mx-auto px-lg">
        <div className="text-center mb-xl">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-text-primary">
            How It Works
          </h2>
          <p className="mt-sm text-text-secondary font-body max-w-lg mx-auto">
            Your journey in four simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-lg">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-accent text-white flex items-center justify-center text-lg font-display font-semibold mb-sm">
                {s.step}
              </div>
              <h3 className="text-lg font-display font-semibold text-text-primary mb-1">{s.title}</h3>
              <p className="text-sm text-text-secondary font-body">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
