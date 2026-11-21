import areaCrystalCaves from '@/assets/landing/area-crystal-caves.webp';
import areaEmberHollow from '@/assets/landing/area-ember-hollow.webp';
import areaFrostpeakSummit from '@/assets/landing/area-frostpeak-summit.webp';
import areaShadowForest from '@/assets/landing/area-shadow-forest.webp';
import areaSunkenArchive from '@/assets/landing/area-sunken-archive.webp';
import areaVerdantMeadow from '@/assets/landing/area-verdant-meadow.webp';

const AREAS = [
  {
    name: 'Verdant Meadow',
    description: 'A peaceful meadow with wild familiars.',
    image: areaVerdantMeadow,
  },
  {
    name: 'Crystal Caves',
    description: 'Shimmering caves with rare creatures.',
    image: areaCrystalCaves,
  },
  {
    name: 'Shadow Forest',
    description: 'A dark forest with powerful familiars.',
    image: areaShadowForest,
  },
  {
    name: 'Ember Hollow',
    description: 'A scorched caldera where fire familiars gather.',
    image: areaEmberHollow,
  },
  {
    name: 'Frostpeak Summit',
    description: 'A frozen peak above the clouds.',
    image: areaFrostpeakSummit,
  },
  {
    name: 'Sunken Archive',
    description: 'A drowned library guarded by ancient runes.',
    image: areaSunkenArchive,
  },
];

function Areas(): JSX.Element {
  return (
    <section className="bg-surface-secondary py-3xl">
      <div className="mx-auto max-w-content px-md sm:px-lg">
        <h2 className="font-display text-[2rem] font-semibold leading-tight text-text-primary">
          Six areas, each guarded by a boss
        </h2>
        <p className="mt-sm max-w-[60ch] font-body text-base leading-relaxed text-text-secondary">
          Every run goes room by room through one area. Clear it and the next one opens.
        </p>

        <div className="mt-xl grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((area) => (
            <figure key={area.name}>
              <div className="aspect-[4/3] overflow-hidden rounded-md">
                <img
                  src={area.image}
                  alt={`${area.name} area painting`}
                  width={640}
                  height={480}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
              <figcaption className="mt-sm">
                <p className="font-display text-[1.2rem] font-semibold leading-tight text-text-primary">{area.name}</p>
                <p className="mt-xs font-body text-[0.85rem] leading-relaxed text-text-secondary">{area.description}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Areas;
