import areaCrystalCaves from '@/assets/landing/area-crystal-caves.webp';
import fireBomb from '@/assets/landing/item-fire_bomb.webp';
import luckyCoin from '@/assets/landing/item-lucky_coin.webp';
import phoenixFeather from '@/assets/landing/item-phoenix_feather.webp';
import potionSmall from '@/assets/landing/item-potion_small.webp';
import whiteDogPortrait from '@/assets/landing/familiar-whiteDog.webp';
import aquaSpritePortrait from '@/assets/landing/familiar-aquaSprite.webp';

interface Step {
  title: string;
  description: string;
  illustration: JSX.Element;
}

const STEPS: Step[] = [
  {
    title: 'Pick two familiars',
    description: 'Your party is two familiars. Choose a pair that covers each other.',
    illustration: (
      <span className="flex items-end">
        <img
          src={whiteDogPortrait}
          alt=""
          width={256}
          height={256}
          loading="lazy"
          decoding="async"
          className="h-12 w-12 object-contain"
        />
        <img
          src={aquaSpritePortrait}
          alt=""
          width={256}
          height={256}
          loading="lazy"
          decoding="async"
          className="-ml-2 h-12 w-12 object-contain"
        />
      </span>
    ),
  },
  {
    title: 'Explore room by room',
    description: 'Each room holds a fight, a curio, or loot. You choose when to push on.',
    illustration: (
      <img
        src={areaCrystalCaves}
        alt=""
        width={640}
        height={480}
        loading="lazy"
        decoding="async"
        className="h-12 w-16 rounded-sm object-cover"
      />
    ),
  },
  {
    title: 'Win turn-based battles',
    description: "Spend MP on abilities and play to your familiars' affinities.",
    illustration: (
      <span className="flex items-end gap-1">
        <img
          src={fireBomb}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          className="h-10 w-10 object-contain"
        />
        <img
          src={potionSmall}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          className="h-10 w-10 object-contain"
        />
      </span>
    ),
  },
  {
    title: 'Level up and recruit',
    description: 'Wins earn XP and items, and new familiars join your collection.',
    illustration: (
      <span className="flex items-end gap-1">
        <img
          src={luckyCoin}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          className="h-10 w-10 object-contain"
        />
        <img
          src={phoenixFeather}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          className="h-10 w-10 object-contain"
        />
      </span>
    ),
  },
];

function HowItWorks(): JSX.Element {
  return (
    <section className="bg-surface-primary py-3xl">
      <div className="mx-auto max-w-content px-md sm:px-lg">
        <h2 className="font-display text-[2rem] font-semibold leading-tight text-text-primary">How a run works</h2>

        <ol className="relative mt-xl flex flex-col gap-xl lg:grid lg:grid-cols-4 lg:gap-lg">
          <div
            aria-hidden="true"
            className="absolute bottom-5 left-5 top-5 border-l-2 border-dashed border-border lg:hidden"
          />
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden border-t-2 border-dashed border-border lg:block"
          />

          {STEPS.map((step, index) => (
            <li key={step.title} className="relative flex gap-md lg:block">
              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light font-display text-base font-semibold text-accent">
                {index + 1}
              </div>
              <div className="lg:mt-md">
                <div className="flex min-h-[48px] items-end">{step.illustration}</div>
                <h3 className="mt-sm font-display text-[1.2rem] font-semibold leading-tight text-text-primary">
                  {step.title}
                </h3>
                <p className="mt-xs max-w-[60ch] font-body text-base leading-relaxed text-text-secondary">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
