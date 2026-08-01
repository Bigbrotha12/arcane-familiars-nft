import Card from '@/components/ui/Card'

const abilities = [
  { name: 'Brave', desc: '+20% ATK for 3 turns', color: 'text-error' },
  { name: 'Sturdy', desc: 'Reduce incoming damage by 15%', color: 'text-teal' },
  { name: 'Arcane Blast', desc: 'Deal 50 magic damage', color: 'text-accent' },
]

function BattlePreview() {
  return (
    <section className="py-3xl bg-gradient-to-b from-surface-primary to-accent-light/20">
      <div className="max-w-content mx-auto px-lg">
        <div className="text-center mb-xl">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-text-primary">
            Turn-Based Battles
          </h2>
          <p className="mt-sm text-text-secondary font-body max-w-lg mx-auto">
            Simple to learn, deep to master. Combine abilities and exploit weaknesses.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg items-center">
          <Card className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <div>
                <h3 className="text-lg font-display font-semibold text-text-primary">Your Familiar</h3>
                <div className="flex gap-2 mt-1">
                  <span className="h-2 flex-1 rounded-full bg-teal" />
                  <span className="h-2 flex-1 rounded-full bg-teal/40" />
                  <span className="h-2 flex-1 rounded-full bg-teal/40" />
                </div>
              </div>
              <span className="text-4xl">🐕</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {abilities.map((a) => (
                <Card key={a.name} hover={false} className="p-2 text-center bg-surface-alt/50">
                  <p className={`text-xs font-display font-semibold ${a.color}`}>{a.name}</p>
                  <p className="text-[10px] text-text-muted font-body mt-0.5">{a.desc}</p>
                </Card>
              ))}
            </div>
          </Card>

          <div className="flex flex-col items-center gap-md">
            <span className="text-6xl">⚔️</span>
            <p className="text-text-secondary font-body text-center max-w-sm">
              Each turn, choose an ability. Your familiar's stats and the enemy's weaknesses
              determine the outcome. Victory earns XP and rare items.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default BattlePreview
