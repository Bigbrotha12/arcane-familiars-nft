import { useMemo } from 'react';
import { FAMILIARS } from '@arcane-familiars/game-logic';
import AuthForm from '@/components/auth/AuthForm';
import FamiliarCard from '@/components/collection/FamiliarCard';
import { speciesEntry } from '@/components/collection/entries';
import Card from '@/components/ui/Card';

/**
 * The codex lists every species from the shared game data (the same source the
 * game uses), so it can never fall behind the game. Regular species come
 * first, bosses last.
 */
export default function CollectionPage(): JSX.Element {
  const entries = useMemo(() => {
    const ids = Object.keys(FAMILIARS);
    const ordered = [...ids.filter((id) => !FAMILIARS[id].isBoss), ...ids.filter((id) => FAMILIARS[id].isBoss)];
    return ordered.map(speciesEntry);
  }, []);

  return (
    <div className="bg-surface-primary">
      <div className="mx-auto max-w-content px-lg py-2xl">
        <header className="mb-xl flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-semibold text-text-primary md:text-4xl">Familiar Codex</h1>
            <p className="mt-sm font-body text-text-secondary">
              Every familiar species, ability, and stat in the world of Arcane Familiars.
            </p>
          </div>
          <AuthForm compact />
        </header>

        {entries.length === 0 && (
          <Card hover={false} className="mx-auto max-w-lg p-xl text-center">
            <h2 className="font-display text-xl font-semibold text-text-primary">No familiars in the codex yet</h2>
            <p className="mt-sm font-body text-sm text-text-secondary">New familiars are on the way.</p>
          </Card>
        )}

        {entries.length > 0 && (
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
            {entries.map((entry) => (
              <FamiliarCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
