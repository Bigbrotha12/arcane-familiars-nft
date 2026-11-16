import { Link } from 'react-router-dom';
import leafBunnyPortrait from '@/assets/landing/familiar-leafBunny.webp';
import sparkMousePortrait from '@/assets/landing/familiar-sparkMouse.webp';
import tideTurtlePortrait from '@/assets/landing/familiar-tideTurtle.webp';
import yellowFighterPortrait from '@/assets/landing/familiar-yellowFighter.webp';
import Button from '@/components/ui/Button';

const LINE_UP = [
  { id: 'leafBunny', portrait: leafBunnyPortrait },
  { id: 'yellowFighter', portrait: yellowFighterPortrait },
  { id: 'tideTurtle', portrait: tideTurtlePortrait },
  { id: 'sparkMouse', portrait: sparkMousePortrait },
];

function ClosingCall(): JSX.Element {
  return (
    <section className="bg-surface-primary py-3xl">
      <div className="mx-auto max-w-content px-md sm:px-lg">
        <div className="relative overflow-hidden rounded-lg bg-accent p-lg text-white sm:p-2xl">
          <div className="relative z-10 lg:max-w-[62%]">
            <h2 className="font-display text-[2rem] font-semibold leading-tight text-white">
              Pick your first two familiars
            </h2>
            <p className="mt-sm max-w-[60ch] font-body text-base leading-relaxed text-white/85">
              It runs in your browser. No download.
            </p>
            <div className="mt-lg">
              <Link
                to="/play/game"
                className="inline-block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
              >
                <Button
                  variant="secondary"
                  size="lg"
                  tabIndex={-1}
                  className="!bg-white !text-accent hover:!bg-white/90"
                >
                  Start playing
                </Button>
              </Link>
            </div>
          </div>

          <div aria-hidden="true" className="absolute bottom-0 right-6 hidden translate-y-4 items-end lg:flex">
            {LINE_UP.map((item, index) => (
              <img
                key={item.id}
                src={item.portrait}
                alt=""
                width={256}
                height={256}
                loading="lazy"
                decoding="async"
                className={`h-[150px] w-[150px] object-contain ${index > 0 ? '-ml-[30px]' : ''}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ClosingCall;
