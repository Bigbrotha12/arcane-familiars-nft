import battleCaveWarden from '@/assets/landing/battle-cave-warden.webp';
import shadowCatPortrait from '@/assets/landing/familiar-shadowCat.webp';

const ABILITIES = [
  { name: 'Shadow Strike', cost: '18 MP', selected: true },
  { name: 'Quickstep', cost: '8 MP', selected: false },
  { name: 'Brave', cost: '8 MP', selected: false },
  { name: 'Item', cost: '', selected: false },
];

const HUD_PANEL = 'rounded-md border border-[#A78BFA] bg-text-primary/90 text-white';

function BattlePreview(): JSX.Element {
  return (
    <section className="bg-surface-secondary py-3xl">
      <div className="mx-auto max-w-content px-md sm:px-lg">
        <div className="grid items-center gap-2xl lg:grid-cols-12 lg:gap-lg">
          <div className="lg:col-span-5">
            <h2 className="font-display text-[2rem] font-semibold leading-tight text-text-primary">
              Battles you can read at a glance
            </h2>
            <p className="mt-sm max-w-[60ch] font-body text-base leading-relaxed text-text-secondary">
              Each turn you choose one ability. Your familiar's stats and the enemy's affinity decide how hard it lands.
            </p>
            <ul className="mt-md max-w-[60ch] list-disc space-y-sm pl-5 font-body text-base leading-relaxed text-text-secondary marker:text-accent">
              <li>Abilities cost MP, so every turn is a trade-off.</li>
              <li>Six affinities: Light, Dark, Fire, Water, Earth, Wind.</li>
              <li>Bosses wait at the end of every area.</li>
            </ul>
          </div>

          <div className="lg:col-span-7">
            <figure aria-label="Example battle: Shadow Cat against the Cave Warden" className="w-full">
              <div
                aria-hidden="true"
                className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border-2 border-[#A78BFA]"
              >
                <img
                  src={battleCaveWarden}
                  alt=""
                  width={800}
                  height={600}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />

                <img
                  src={shadowCatPortrait}
                  alt=""
                  width={256}
                  height={256}
                  loading="lazy"
                  decoding="async"
                  className="absolute bottom-[22%] left-[5%] w-[38%] max-w-[256px] drop-shadow-2xl"
                />

                <div
                  className={`absolute left-2 top-2 min-w-[122px] p-2 sm:left-3 sm:top-3 sm:min-w-[150px] sm:p-3 ${HUD_PANEL}`}
                >
                  <p className="font-display text-[0.8rem] font-semibold leading-tight sm:text-[0.95rem]">Shadow Cat</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15 sm:h-2">
                      <div className="h-full rounded-full bg-teal" style={{ width: '78%' }} />
                    </div>
                    <span className="font-mono text-[9px] tabular-nums text-white/80 sm:text-[10px]">78 / 100</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15 sm:h-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: '60%' }} />
                    </div>
                    <span className="hidden font-mono text-[10px] tabular-nums text-white/80 sm:inline">54 / 90</span>
                  </div>
                </div>

                <div
                  className={`absolute right-2 top-2 min-w-[122px] p-2 sm:right-3 sm:top-3 sm:min-w-[150px] sm:p-3 ${HUD_PANEL}`}
                >
                  <div className="flex items-center gap-1.5">
                    <p className="font-display text-[0.8rem] font-semibold leading-tight sm:text-[0.95rem]">
                      Cave Warden
                    </p>
                    <span className="rounded-full bg-pink/20 px-1.5 py-px font-body text-[9px] font-medium leading-tight text-pink sm:text-[10px]">
                      Boss
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15 sm:h-2">
                    <div className="h-full rounded-full bg-teal" style={{ width: '55%' }} />
                  </div>
                </div>

                <div className="absolute bottom-2 right-2 grid grid-cols-2 gap-1 sm:bottom-3 sm:right-3 sm:gap-1.5">
                  {ABILITIES.map((ability, index) => (
                    <div
                      key={ability.name}
                      className={`rounded-md p-1.5 text-white sm:p-2 ${
                        ability.selected
                          ? 'border-2 border-[#A78BFA] bg-text-primary/95'
                          : 'border border-[#A78BFA] bg-text-primary/85'
                      } ${index === 3 ? 'hidden sm:block' : ''}`}
                    >
                      <p className="font-body text-[0.7rem] font-medium leading-tight sm:text-[0.8rem]">
                        {ability.name}
                      </p>
                      {ability.cost && (
                        <p className="font-mono text-[0.65rem] leading-tight text-white/70 sm:text-[0.7rem]">
                          {ability.cost}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BattlePreview;
