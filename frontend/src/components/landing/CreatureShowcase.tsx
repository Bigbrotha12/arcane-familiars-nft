import Card, { CardBody } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

const familiars = [
  {
    name: 'Whitedog',
    rarity: 'rare' as const,
    emoji: '🐕',
    desc: 'A loyal companion with fierce protective instincts.',
  },
  {
    name: 'Yellow Fighter',
    rarity: 'common' as const,
    emoji: '🐱',
    desc: 'Agile and quick, strikes before you blink.',
  },
  { name: 'Mystic Sprite', rarity: 'epic' as const, emoji: '🧚', desc: 'Woven from pure arcane energy.' },
  { name: 'Ember Fox', rarity: 'legendary' as const, emoji: '🦊', desc: 'Born in the heart of a dying star.' },
];

function CreatureShowcase() {
  return (
    <section className="py-3xl bg-surface-alt/50">
      <div className="max-w-content mx-auto px-lg">
        <div className="text-center mb-xl">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-text-primary">Meet the Familiars</h2>
          <p className="mt-sm text-text-secondary font-body max-w-lg mx-auto">
            Each familiar is a unique NFT with its own stats, abilities, and personality.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
          {familiars.map((f) => (
            <Card key={f.name} className="relative overflow-hidden">
              <div className="absolute top-sm right-sm z-10">
                <Badge variant={f.rarity}>{f.rarity}</Badge>
              </div>
              <div className="h-48 bg-gradient-to-br from-accent-light/40 to-accent/10 flex items-center justify-center">
                <span className="text-7xl">{f.emoji}</span>
              </div>
              <div className="border-t border-border" />
              <CardBody>
                <h3 className="text-lg font-display font-semibold text-text-primary mb-1">{f.name}</h3>
                <p className="text-sm text-text-secondary font-body">{f.desc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export default CreatureShowcase;
