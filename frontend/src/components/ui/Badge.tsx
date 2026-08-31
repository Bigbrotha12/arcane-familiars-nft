type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

interface BadgeProps {
  children: string;
  variant?: Rarity;
  className?: string;
}

const rarityStyles: Record<Rarity, string> = {
  common: 'bg-surface-alt text-text-secondary',
  rare: 'bg-accent-light text-accent',
  epic: 'bg-[#FCE7F3] text-[#BE185D]',
  legendary: 'bg-[#FEF3C7] text-[#D97706]',
};

function Badge({ children, variant = 'common', className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5
        rounded-full text-xs font-body font-medium
        ${rarityStyles[variant]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}

export default Badge;
