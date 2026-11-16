import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Affinity, FAMILIARS } from '@arcane-familiars/game-logic';
import AffinityChip from '@/components/game/hud/AffinityChip';
import { HERO_FAMILIARS } from '@/components/landing/landingData';
import Button from '@/components/ui/Button';

const STAT_ROWS = [
  { key: 'hp', label: 'HP', max: 150 },
  { key: 'attack', label: 'Attack', max: 100 },
  { key: 'defense', label: 'Defense', max: 100 },
  { key: 'arcane', label: 'Arcane', max: 100 },
  { key: 'speed', label: 'Speed', max: 100 },
] as const;

function Hero(): JSX.Element {
  const [selectedId, setSelectedId] = useState(HERO_FAMILIARS[0].id);
  const selected = HERO_FAMILIARS.find((familiar) => familiar.id === selectedId) ?? HERO_FAMILIARS[0];
  const familiar = FAMILIARS[selected.id];

  return (
    <section className="relative overflow-hidden bg-surface-primary">
      <div className="relative mx-auto max-w-content px-md py-2xl sm:px-lg lg:py-3xl">
        <div className="grid items-center gap-2xl lg:grid-cols-12 lg:gap-lg">
          <div className="lg:col-span-5">
            <h1
              className="landing-rise font-display text-5xl font-semibold leading-[1.05] text-text-primary lg:text-6xl"
              style={{ animationDelay: '0ms' }}
            >
              Collect. Battle. Bond.
            </h1>

            <p
              className="landing-rise mt-md max-w-[60ch] font-body text-base leading-relaxed text-text-secondary"
              style={{ animationDelay: '80ms' }}
            >
              Summon familiars, take two of them into a dungeon, and bring back loot and new companions.
            </p>

            <div
              className="landing-rise mt-lg flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
              style={{ animationDelay: '160ms' }}
            >
              <Link
                to="/play/game"
                className="inline-block shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
              >
                <Button size="lg" tabIndex={-1}>
                  Start playing
                </Button>
              </Link>
              <Link
                to="/app/collection"
                className="inline-block shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary"
              >
                <Button variant="secondary" size="lg" tabIndex={-1}>
                  Browse the codex
                </Button>
              </Link>
            </div>

            <p
              className="landing-rise mt-md max-w-[60ch] font-body text-sm text-text-muted"
              style={{ animationDelay: '160ms' }}
            >
              Free to play in your browser. Sign up with email to save progress.
            </p>
          </div>

          <div className="landing-rise relative min-w-0 lg:col-span-7" style={{ animationDelay: '240ms' }}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-light blur-3xl"
            />

            <div className="relative">
              <div className="relative mx-auto aspect-[4/3] w-full max-w-[560px] overflow-hidden rounded-lg border border-border shadow-card-hover">
                {HERO_FAMILIARS.map((item) => (
                  <img
                    key={item.id}
                    src={item.backdrop}
                    alt=""
                    width={640}
                    height={480}
                    decoding="async"
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[400ms] ease-out ${
                      item.id === selected.id ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                ))}

                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-surface-primary to-transparent"
                />

                <div className="absolute inset-x-0 bottom-0 flex justify-center">
                  <div key={selected.id} className="landing-pop-in relative w-[240px] max-w-[60%] sm:max-w-none">
                    <div
                      aria-hidden="true"
                      className="absolute bottom-1 left-1/2 h-4 w-3/4 -translate-x-1/2 rounded-full bg-text-primary/25 blur-md"
                    />
                    <img
                      src={selected.portrait}
                      alt={familiar.name}
                      width={256}
                      height={256}
                      decoding="async"
                      className="animate-float relative h-auto w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="relative z-10 mx-auto -mt-6 w-[92%] rounded-lg border border-border bg-surface-card p-lg shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-[1.5rem] font-semibold leading-tight text-text-primary">
                    {familiar.name}
                  </p>
                  <AffinityChip affinity={Affinity[familiar.affinity]} size="sm" />
                </div>

                <p className="mt-sm font-body text-base leading-relaxed text-text-secondary">{familiar.description}</p>

                <div className="mt-md grid gap-sm sm:grid-cols-2 sm:gap-x-lg">
                  {STAT_ROWS.map((row) => {
                    const value = familiar.stats[row.key];
                    const percent = Math.min(100, (value / row.max) * 100);
                    return (
                      <div
                        key={row.key}
                        className={`flex items-center gap-2 ${row.key === 'hp' ? 'sm:col-span-2' : ''}`}
                      >
                        <span className="w-16 shrink-0 font-body text-[0.85rem] font-medium text-text-secondary">
                          {row.label}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                          <div
                            className={`h-full rounded-full transition-[width] duration-[400ms] ease-out ${
                              row.key === 'hp' ? 'bg-teal' : 'bg-accent'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-text-primary">
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-lg -mx-md flex flex-nowrap justify-center gap-2 px-1 py-1 sm:mx-0 sm:flex-wrap sm:gap-3">
                {HERO_FAMILIARS.map((item) => {
                  const isSelected = item.id === selected.id;
                  const name = FAMILIARS[item.id].name;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Show ${name}`}
                      onClick={() => setSelectedId(item.id)}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-card transition-transform duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary sm:h-14 sm:w-14 ${
                        isSelected
                          ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-primary max-[380px]:ring-inset max-[380px]:ring-offset-0'
                          : 'hover:-translate-y-0.5'
                      }`}
                    >
                      <img
                        src={item.portrait}
                        alt=""
                        width={256}
                        height={256}
                        decoding="async"
                        className="h-[34px] w-[34px] object-contain sm:h-11 sm:w-11"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
