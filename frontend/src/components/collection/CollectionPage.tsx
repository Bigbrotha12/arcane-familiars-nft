import { useEffect, useState } from 'react';
import AuthForm from '@/components/auth/AuthForm';
import FamiliarCard from '@/components/collection/FamiliarCard';
import { catalogEntry, type CollectionEntry } from '@/components/collection/entries';
import Card from '@/components/ui/Card';
import { fetchCatalog, type CatalogFamiliar } from '@/lib/collection';

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

function LoadingGrid(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} hover={false} className="overflow-hidden">
          <div className="h-48 animate-pulse bg-surface-alt" />
          <div className="border-t border-border" />
          <div className="p-lg">
            <div className="mb-sm h-5 w-2/3 animate-pulse rounded-sm bg-surface-alt" />
            <div className="h-4 w-full animate-pulse rounded-sm bg-surface-alt" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function CollectionPage(): JSX.Element {
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalog()
      .then((catalog: CatalogFamiliar[]) => {
        if (!cancelled) setEntries(catalog.map(catalogEntry));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageFrom(err));
      });
    return () => {
      cancelled = true;
    };
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

        {error && (
          <Card hover={false} className="mx-auto max-w-lg p-xl text-center">
            <h2 className="font-display text-xl font-semibold text-text-primary">Could not load the codex</h2>
            <p className="mt-sm font-body text-sm text-text-secondary">{error}</p>
          </Card>
        )}

        {!error && !entries && <LoadingGrid />}

        {!error && entries && entries.length === 0 && (
          <Card hover={false} className="mx-auto max-w-lg p-xl text-center">
            <h2 className="font-display text-xl font-semibold text-text-primary">No familiars in the codex yet</h2>
            <p className="mt-sm font-body text-sm text-text-secondary">New familiars are on the way.</p>
          </Card>
        )}

        {!error && entries && entries.length > 0 && (
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
