import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import PassportLogin from '@/components/auth/PassportLogin';
import FamiliarCard from '@/components/collection/FamiliarCard';
import { catalogEntry, speciesEntry, type CollectionEntry } from '@/components/collection/entries';
import Button from '@/components/ui/Button';
import Card, { CardBody } from '@/components/ui/Card';
import { fetchCatalog, fetchOwnedFamiliars, type CatalogFamiliar } from '@/lib/collection';
import { readIdToken } from '@/lib/token';

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

function Grid({ entries }: { entries: CollectionEntry[] }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
      {entries.map((entry) => (
        <FamiliarCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function LoadingGrid(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} hover={false} className="overflow-hidden">
          <div className="h-48 animate-pulse bg-surface-alt" />
          <div className="border-t border-border" />
          <CardBody>
            <div className="mb-sm h-5 w-2/3 animate-pulse rounded-sm bg-surface-alt" />
            <div className="h-4 w-full animate-pulse rounded-sm bg-surface-alt" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function Panel({ title, body, children }: { title: string; body?: string; children?: ReactNode }): JSX.Element {
  return (
    <Card hover={false} className="mx-auto max-w-lg p-xl text-center">
      <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>
      {body && <p className="mt-sm font-body text-sm text-text-secondary">{body}</p>}
      {children && <div className="mt-lg flex justify-center">{children}</div>}
    </Card>
  );
}

function Notice({ text }: { text: string }): JSX.Element {
  return (
    <div
      role="status"
      className="mb-lg rounded-md border border-warning/40 bg-warning/10 px-md py-sm font-body text-sm text-text-secondary"
    >
      {text}
    </div>
  );
}

function CatalogSection({ entries, heading }: { entries: CollectionEntry[]; heading: string }): JSX.Element {
  if (entries.length === 0) {
    return <Panel title="No familiars in the catalog yet" body="New familiars are on the way — check back soon." />;
  }

  return (
    <section>
      <h2 className="mb-md font-display text-xl font-semibold text-text-primary">{heading}</h2>
      <Grid entries={entries} />
    </section>
  );
}

export default function CollectionPage(): JSX.Element {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean>(() => readIdToken() !== null);
  const [catalog, setCatalog] = useState<CatalogFamiliar[] | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [ownedSynced, setOwnedSynced] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSyncError(null);

    const catalogPromise = fetchCatalog();

    // Guests only ever see the public catalog.
    if (!signedIn) {
      try {
        setCatalog(await catalogPromise);
      } catch (err) {
        setError(messageFrom(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const [catalogResult, ownedResult] = await Promise.allSettled([catalogPromise, fetchOwnedFamiliars()]);

    if (catalogResult.status === 'fulfilled') {
      setCatalog(catalogResult.value);
    }

    // Passport session expired and could not be refreshed. Drop back to the
    // guest view; changing `signedIn` re-runs this effect down the guest path.
    if (ownedResult.status === 'fulfilled' && ownedResult.value.unauthenticated) {
      setOwned([]);
      setOwnedSynced(false);
      setSyncError(null);
      setSignedIn(false);
      return;
    }

    if (ownedResult.status === 'fulfilled') {
      setOwned(ownedResult.value.familiars);
      setOwnedSynced(ownedResult.value.synced);
      setSyncError(ownedResult.value.error ?? null);
    } else {
      setOwned([]);
      setOwnedSynced(false);
      setSyncError('Could not sync your collection right now.');
    }

    // The catalog is only needed here as a fallback for a failed/empty sync, so
    // it is fatal only when there is nothing else to show.
    const catalogFailed = catalogResult.status === 'rejected';
    const ownedUsable = ownedResult.status === 'fulfilled' && ownedResult.value.synced;
    if (catalogFailed && !ownedUsable) {
      setError('Could not load your collection. Please try again.');
    }

    setLoading(false);
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAuthChange = useCallback((next: boolean) => {
    setSignedIn(next);
  }, []);

  const retryButton = <Button onClick={() => void load()}>Try again</Button>;
  const ownedEntries = owned.map(speciesEntry);
  const catalogEntries = (catalog ?? []).map(catalogEntry);

  const renderBody = (): JSX.Element => {
    if (loading) {
      return <LoadingGrid />;
    }

    if (error) {
      return (
        <Panel title="We couldn't load your collection" body={error}>
          {retryButton}
        </Panel>
      );
    }

    if (!signedIn) {
      return (
        <>
          <Card hover={false} className="mb-2xl p-lg">
            <h2 className="font-display text-xl font-semibold text-text-primary">Sign in to summon and collect</h2>
            <p className="mt-xs font-body text-sm text-text-secondary">
              Your collection is tied to your Immutable Passport. Sign in with the button above to summon familiars and
              track the ones you own.
            </p>
          </Card>

          <CatalogSection entries={catalogEntries} heading="All Familiars" />
        </>
      );
    }

    if (ownedEntries.length > 0) {
      return <Grid entries={ownedEntries} />;
    }

    if (syncError) {
      return catalogEntries.length > 0 ? (
        <>
          <Notice text="We couldn't sync your collection right now — showing the full catalog instead." />
          <CatalogSection entries={catalogEntries} heading="Browse the full catalog" />
        </>
      ) : (
        <Panel
          title="Collection unavailable"
          body="We couldn't sync your familiars or load the catalog. Please try again in a moment."
        >
          {retryButton}
        </Panel>
      );
    }

    return (
      <Panel
        title="No familiars yet"
        body={
          ownedSynced
            ? "Your wallet doesn't hold any familiars yet. Head into the game to summon your first companion."
            : "We couldn't find a wallet linked to your Passport. Link one to sync the familiars you own."
        }
      >
        <Button onClick={() => navigate('/play/game')}>Play and summon</Button>
      </Panel>
    );
  };

  return (
    <div className="bg-surface-primary">
      <div className="mx-auto max-w-content px-lg py-2xl">
        <header className="mb-xl flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-semibold text-text-primary md:text-4xl">Collection</h1>
            <p className="mt-sm font-body text-text-secondary">
              {signedIn ? 'The familiars bound to your Passport.' : 'Every familiar waiting to be summoned.'}
            </p>
          </div>
          <PassportLogin onAuthChange={handleAuthChange} />
        </header>

        {renderBody()}
      </div>
    </div>
  );
}
