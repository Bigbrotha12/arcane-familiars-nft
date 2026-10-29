// Preview showing Compact Card positioned near sprites (left of enemy, right of player)
// with solid background and double border.

import type { FamiliarState } from '@/game';
import FamiliarStatusCompact from '../hud/FamiliarStatusCompact';

const mockFamiliar: FamiliarState = {
  id: 'whiteDog',
  name: 'Lumina',
  hp: 45,
  maxHp: 60,
  mp: 12,
  maxMp: 25,
  attack: 18,
  defense: 12,
  speed: 15,
  arcane: 20,
  affinity: 'light',
};

const mockEnemy: FamiliarState = {
  id: 'shadowCat',
  name: 'Umbra',
  hp: 18,
  maxHp: 50,
  mp: 8,
  maxMp: 20,
  attack: 22,
  defense: 10,
  speed: 18,
  arcane: 15,
  affinity: 'shadow',
};

const mockStatusEffects = [
  { id: 'burn', icon: '🔥', duration: 2 },
  { id: 'shield', icon: '🛡️', duration: 3 },
  { id: 'regen', icon: '💚', duration: 1 },
];

function CompactCardInContext() {
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      {/* Enemy area - top right */}
      <div className="absolute top-24 right-24">
        {/* Enemy sprite placeholder */}
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 border-2 border-purple-400 shadow-lg flex items-center justify-center text-4xl">
          👾
        </div>
      </div>

      {/* Enemy card - positioned to the LEFT of enemy sprite with separation */}
      <div className="absolute top-20 right-[440px]">
        <FamiliarStatusCompact familiar={mockEnemy} isBoss statusEffects={mockStatusEffects} />
      </div>

      {/* Player area - bottom left */}
      <div className="absolute bottom-24 left-24">
        {/* Player sprite placeholder */}
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 border-2 border-blue-300 shadow-lg flex items-center justify-center text-4xl">
          🐕
        </div>
      </div>

      {/* Player card - positioned to the RIGHT of player sprite with separation */}
      <div className="absolute bottom-24 left-[440px]">
        <FamiliarStatusCompact familiar={mockFamiliar} statusEffects={mockStatusEffects} />
      </div>
    </div>
  );
}

export default CompactCardInContext;
