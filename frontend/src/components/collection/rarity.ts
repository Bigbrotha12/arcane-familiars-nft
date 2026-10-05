export type BadgeVariant = 'common' | 'rare' | 'epic' | 'legendary';

/**
 * Single normalization point for the three rarity vocabularies in play:
 *
 *   - game-logic `Rarity`: Common | Uncommon | Rare | Legendary
 *   - D1 `familiars.rarity` CHECK: common | uncommon | rare | secret | legendary
 *   - `Badge` variants: common | rare | epic | legendary
 *
 * `Uncommon` has no dedicated badge tier, so it shares the `common` style;
 * `secret` (the D1 top tier) renders as `legendary`. Inputs are matched
 * case-insensitively and unknown values fall back to `common`, so adding a new
 * rarity server-side degrades to a neutral badge instead of crashing the grid.
 */
export function toBadgeVariant(rarity: string | undefined | null): BadgeVariant {
  switch ((rarity ?? '').trim().toLowerCase()) {
    case 'rare':
      return 'rare';
    case 'epic':
      return 'epic';
    case 'secret':
    case 'legendary':
      return 'legendary';
    default:
      return 'common';
  }
}

/** Human-readable label for a rarity string (e.g. `uncommon` -> `Uncommon`). */
export function rarityLabel(rarity: string): string {
  const trimmed = rarity.trim();
  if (!trimmed) return 'Common';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
