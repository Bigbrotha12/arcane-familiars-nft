import { Link } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';
import Hero from '@/components/landing/Hero';
import CreatureShowcase from '@/components/landing/CreatureShowcase';
import HowItWorks from '@/components/landing/HowItWorks';
import BattlePreview from '@/components/landing/BattlePreview';
import Community from '@/components/landing/Community';

export default function LandingPage(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">
      <Nav />

      <main>
        <Hero />
        <CreatureShowcase />
        <HowItWorks />
        <BattlePreview />
        <Community />
      </main>

      <Footer />

      <Link
        to="/preview"
        className="fixed bottom-4 right-4 rounded-md bg-[#7C5CFC]/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition-all hover:bg-[#7C5CFC] hover:shadow-xl"
      >
        Preview UI
      </Link>
    </div>
  );
}
