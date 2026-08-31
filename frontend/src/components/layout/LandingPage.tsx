import { useState } from 'react';
import { Link } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Hero from '@/components/landing/Hero';
import CreatureShowcase from '@/components/landing/CreatureShowcase';
import HowItWorks from '@/components/landing/HowItWorks';
import BattlePreview from '@/components/landing/BattlePreview';
import Community from '@/components/landing/Community';

export default function LandingPage(): JSX.Element {
  const [walletOpen, setWalletOpen] = useState(false);

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

      {/* Dev-only preview link */}
      <Link
        to="/preview"
        className="fixed bottom-4 right-4 rounded-md bg-[#7C5CFC]/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition-all hover:bg-[#7C5CFC] hover:shadow-xl"
      >
        Preview UI
      </Link>

      <Modal open={walletOpen} onClose={() => setWalletOpen(false)} title="Connect Wallet">
        <div className="flex flex-col gap-3">
          <Button variant="secondary" className="w-full justify-start !rounded-md" onClick={() => setWalletOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
            </svg>
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
  );
}
