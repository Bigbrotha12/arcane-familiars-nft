import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import Card, { CardBody } from '@/components/ui/Card';
import type { CollectionEntry } from '@/components/collection/entries';
import { rarityLabel, toBadgeVariant } from '@/components/collection/rarity';

interface FamiliarCardProps {
  entry: CollectionEntry;
}

/**
 * Only absolute/frontend-root-relative sources can be loaded by the SPA. The
 * D1 seed stores bare filenames (e.g. `0001.png`) with no reachable base, so
 * those fall through to the styled placeholder instead of a broken image.
 */
function resolveImageSrc(image?: string): string | undefined {
  const trimmed = image?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/') || trimmed.startsWith('//') || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="text-center">
      <dt className="text-xs font-body uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}

export default function FamiliarCard({ entry }: FamiliarCardProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const src = resolveImageSrc(entry.image);

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-sm right-sm z-10">
        <Badge variant={toBadgeVariant(entry.rarity)}>{rarityLabel(entry.rarity)}</Badge>
      </div>

      <div className="flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-accent-light/40 to-accent/10">
        {src && !imageFailed ? (
          <img
            src={src}
            alt={entry.name}
            loading="lazy"
            className="h-full w-full object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="select-none font-display text-7xl font-semibold text-accent/40" aria-hidden="true">
            {entry.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="border-t border-border" />

      <CardBody>
        <h3 className="mb-1 text-lg font-display font-semibold text-text-primary">{entry.name}</h3>
        {entry.affinity && <p className="mb-xs text-xs font-body text-text-muted">{entry.affinity} affinity</p>}
        {entry.description && <p className="text-sm font-body text-text-secondary">{entry.description}</p>}

        <dl className="mt-md grid grid-cols-3 gap-sm border-t border-border pt-sm">
          <Stat label="HP" value={entry.stats.hp} />
          <Stat label="ATK" value={entry.stats.attack} />
          <Stat label="DEF" value={entry.stats.defense} />
        </dl>
      </CardBody>
    </Card>
  );
}
