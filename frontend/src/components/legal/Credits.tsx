interface Credit {
  work: string;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  usedFor: string;
}

const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

// Keep in sync with docs/assets/CREDITS.md (the per-file record).
const ART: Credit[] = [
  {
    work: 'Fire Rpg background',
    author: 'Ironthunder',
    source: 'https://opengameart.org/content/fire-rpg-background',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_4,
    usedFor: 'Ember Hollow rooms, Ember Titan chamber',
  },
  {
    work: 'Blue Ocean Rpg background',
    author: 'Ironthunder',
    source: 'https://opengameart.org/content/blue-ocean-rpg-background',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_4,
    usedFor: 'Sunken Archive rooms',
  },
  {
    work: 'Temple background',
    author: 'Ironthunder',
    source: 'https://opengameart.org/content/temple-background',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_4,
    usedFor: 'Sunken Archive room, Archive Keeper chamber',
  },
  {
    work: 'Forest scene',
    author: 'Ironthunder',
    source: 'https://opengameart.org/content/forest-scene',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_4,
    usedFor: 'Meadow Guardian chamber',
  },
  {
    work: 'Oil painting landscapes',
    author: 'JAP',
    source: 'https://opengameart.org/content/oil-painting-landscapes',
    license: 'CC0',
    licenseUrl: CC0,
    usedFor: 'Frostpeak Summit rooms, Frost Queen chamber',
  },
  {
    work: 'Earth Impact - Magic Effect',
    author: 'Cethiel',
    source: 'https://opengameart.org/content/earth-impact-magic-effect',
    license: 'CC0',
    licenseUrl: CC0,
    usedFor: 'Earth ability effect',
  },
  {
    work: 'Lots of game effects',
    author: 'Soluna Software',
    source: 'https://opengameart.org/content/lots-of-game-effects',
    license: 'CC0',
    licenseUrl: CC0,
    usedFor: 'Wind and Dark ability effects',
  },
];

const AUDIO: Credit[] = [
  {
    work: 'A Heroic Journey (Free Orchestral RPG Music Pack)',
    author: 'cattus',
    source: 'https://cattusvn.itch.io/a-heroic-journey-free-orchestra-rpg-music-pack',
    license: 'Royalty-free',
    licenseUrl: 'https://cattusvn.itch.io/a-heroic-journey-free-orchestra-rpg-music-pack',
    usedFor: 'Music',
  },
  {
    work: 'Free Fantasy 200 SFX Pack',
    author: 'TomMusic',
    source: 'https://tommusic.itch.io/free-fantasy-200-sfx-pack',
    license: 'Royalty-free',
    licenseUrl: 'https://tommusic.itch.io/free-fantasy-200-sfx-pack',
    usedFor: 'Sound effects and ambience',
  },
  {
    work: 'Interface Sounds and RPG Audio',
    author: 'Kenney',
    source: 'https://kenney.nl/assets/interface-sounds',
    license: 'CC0',
    licenseUrl: CC0,
    usedFor: 'Interface and coin sounds',
  },
];

const linkClass = 'text-accent underline-offset-2 hover:underline';

function CreditList({ items }: { items: Credit[] }) {
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.source + c.work}>
          <a href={c.source} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {c.work}
          </a>{' '}
          by {c.author}, licensed{' '}
          <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {c.license}
          </a>
          <span className="block text-sm text-text-muted">{c.usedFor}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Credits() {
  return (
    <div className="max-w-content mx-auto px-lg py-xl">
      <h1 className="text-3xl font-display font-semibold text-text-primary mb-6">Credits</h1>
      <p className="text-text-muted font-body text-sm mb-8">
        Arcane Familiars uses art and audio shared by these creators. Images were cropped, resized and colour-graded to
        fit the game.
      </p>

      <div className="space-y-8 font-body text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Art</h2>
          <CreditList items={ART} />
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Music &amp; Sound</h2>
          <CreditList items={AUDIO} />
        </section>
      </div>
    </div>
  );
}
