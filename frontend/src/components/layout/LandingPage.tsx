import { useState } from 'react'
import Nav from './Nav'
import Footer from './Footer'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Hero from '../landing/Hero'
import CreatureShowcase from '../landing/CreatureShowcase'
import HowItWorks from '../landing/HowItWorks'
import BattlePreview from '../landing/BattlePreview'
import Community from '../landing/Community'

export default function LandingPage(): JSX.Element {
  const [walletOpen, setWalletOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">
      <Nav onConnectWallet={() => setWalletOpen(true)} />

      <main>
        <Hero />
        <CreatureShowcase />
        <HowItWorks />
        <BattlePreview />
        <Community />
      </main>

      <Footer />

      <Modal open={walletOpen} onClose={() => setWalletOpen(false)} title="Connect Wallet">
        <div className="flex flex-col gap-3">
          <Button variant="secondary" className="w-full justify-start !rounded-md" onClick={() => setWalletOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/></svg>
            MetaMask
          </Button>
          <Button variant="secondary" className="w-full justify-start !rounded-md" onClick={() => setWalletOpen(false)}>
            WalletConnect
          </Button>
          <Button variant="secondary" className="w-full justify-start !rounded-md" onClick={() => setWalletOpen(false)}>
            IMX Passport
          </Button>
        </div>
      </Modal>
    </div>
  )
}
