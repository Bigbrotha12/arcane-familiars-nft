import { Link } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';
import Hero from '@/components/landing/Hero';
import Areas from '@/components/landing/Areas';
import HowItWorks from '@/components/landing/HowItWorks';
import BattlePreview from '@/components/landing/BattlePreview';
import ClosingCall from '@/components/landing/ClosingCall';

export default function LandingPage(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-surface-primary">
      <Nav />

      <main>
        <Hero />
        <Areas />
        <HowItWorks />
        <BattlePreview />
        <ClosingCall />
      </main>

      <Footer />

      {import.meta.env.DEV && (
        <Link
          to="/preview"
          className="fixed bottom-4 right-4 rounded-md bg-accent/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition-all hover:bg-accent hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Preview UI
        </Link>
      )}
    </div>
  );
}
