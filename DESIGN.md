# Design System — Arcane Familiars

## Product Context
- **What this is:** A web-based 2D creature-collector NFT game where players summon familiars, craft spells, and battle creatures or other players.
- **Who it's for:** Casual-to-core gamers who enjoy collectible creature games (Pokemon Go, Axie Infinity audience) — people who want cute companions, strategic battles, and real ownership of their assets.
- **Space/industry:** Blockchain gaming / NFT creature battler
- **Project type:** Web app (React SPA) with landing/marketing pages + game canvas interface

## Aesthetic Direction
- **Direction:** Playful & Collectible — warm, bright, approachable. Think cozy indie game meets Pokemon Center, not crypto exchange.
- **Decoration level:** Intentional — soft gradients, subtle magical particle effects on hover, card-style surfaces with gentle shadows. Decoration serves the creatures, not the other way around.
- **Mood:** Warm, inviting, and delightful. The first impression should be "I want that creature," not "I need to understand blockchain." The game has real depth, but the UI makes you feel welcome.
- **Reference sites:** Pokemon Go (warmth, collectibility), Axie Infinity (creature showcase, card battles), Hollow Knight/Hades (2D illustrated charm)

## Typography
- **Display/Hero:** Fredoka (Weight 600) — rounded, friendly, approachable. Used for headings, hero text, and the logo.
- **Body:** DM Sans (Weight 400/500/600) — clean, highly readable, pairs well with Fredoka's rounded forms.
- **UI/Labels:** DM Sans (Weight 500) — slightly heavier for buttons and labels.
- **Data/Tables:** JetBrains Mono (with tabular-nums) — for stats (HP, ATK, DEF), balances, and any monospaced data.
- **Code:** JetBrains Mono
- **Loading:** Google Fonts CDN (`https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&family=DM+Sans:opsz,wght@9..40,100..1000&family=JetBrains+Mono:wght@100..800`)
- **Scale:**
  | Level | Size | Weight | Line Height |
  |-------|------|--------|-------------|
  | Hero heading | 3rem (48px) | 600 | 1.1 |
  | Section heading | 2rem (32px) | 600 | 1.2 |
  | Card heading | 1.2rem (19px) | 600 | 1.3 |
  | Body | 1rem (16px) | 400 | 1.6 |
  | Small/Meta | 0.85rem (14px) | 400 | 1.5 |
  | Data/Stats | 0.75rem (12px) | 500 | 1.4 |

## Color
- **Approach:** Warm and expressive. Color is a primary design tool — the palette is deliberately warmer and brighter than typical blockchain game sites.
- **Primary (Accent):** `#7C5CFC` (magical purple-blue) — CTAs, links, active states, key UI elements
- **Primary hover:** `#6A4AE8` — button hover states
- **Primary light:** `#EDE7FF` — secondary buttons, background tints
- **Teal (Heals/Success):** `#2DD4BF` — health bars, success states, healing effects
- **Pink (Rarity):** `#F472B6` — rare/epic familiar badges, special UI accents
- **Yellow (Currency):** `#FBBF24` — in-game currency, rewards, coins
- **Neutrals (Warm):**
  - Bg Primary: `#FFF8F0` — main light background
  - Bg Secondary: `#FFF1E0` — alternate section background
  - Bg Card: `#FFFFFF` — card surfaces
  - Bg Surface: `#FAF5ED` — subtle surface tint
  - Text Primary: `#1E1B4B` — main body text
  - Text Secondary: `#6366A1` — muted body text
  - Text Muted: `#A5A3C4` — captions, metadata
  - Border: `#E8E4F0` — dividers, card borders
- **Dark mode:**
  - Bg Primary: `#1E1B4B` (deep indigo)
  - Bg Secondary: `#2D2A5E`
  - Bg Card: `#3B3870`
  - Text Primary: `#F0EFFF`
  - Text Secondary: `#B8B5E0`
  - Border: `#3B3870`
  - Reduce accent saturation ~10% for dark backgrounds
- **Semantic:**
  - Success: `#10B981` (green)
  - Warning: `#F59E0B` (amber)
  - Error: `#EF4444` (red)
  - Info/Special: `#7C5CFC` (purple-blue, same as accent)

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — generous padding around creature cards and content sections. More breathing room than typical crypto sites.
- **Scale:**
  | Token | Pixels | Usage |
  |-------|--------|-------|
  | 2xs | 2px | Fine adjustments |
  | xs | 4px | Tight gaps |
  | sm | 8px | Small gaps |
  | md | 16px | Standard gap |
  | lg | 24px | Section padding, card padding |
  | xl | 32px | Large section spacing |
  | 2xl | 48px | Hero padding |
  | 3xl | 64px | Page section separation |

## Layout
- **Approach:** Hybrid — grid-disciplined for app/game interfaces (collection, battle, market), creative-editorial for marketing/landing pages.
- **Grid:**
  - Mobile: 4 columns
  - Tablet: 8 columns
  - Desktop: 12 columns
- **Max content width:** 1200px
- **Border radius:**
  - sm: 6px — inputs, small elements
  - md: 12px — cards, modals, sections
  - lg: 20px — hero cards, large containers
  - full: 9999px — buttons, badges, pills

## Motion
- **Approach:** Intentional — subtle entrance animations for creatures, meaningful state transitions, hover lifts on cards. Motion should feel magical, not technical.
- **Easing:** Enter (ease-out), Exit (ease-in), Move (ease-in-out)
- **Duration:** Micro (50-100ms), Short (150-250ms), Medium (250-400ms), Long (400-700ms)
- **Key animations:**
  - Creature card hover: translateY(-4px) + shadow lift (200ms ease-out)
  - Page transitions: subtle fade (250ms ease-out)
  - Familiar float: infinite 3s ease-in-out (hero mascot)
  - Button hover: translateY(-1px) + shadow (150ms ease-out)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-27 | Initial design system created | Created by /design-consultation based on product context + competitive research |
| 2026-07-27 | Warm/light palette over dark/crypto default | Every blockchain game uses dark + gold. Warm cream + purple-blue distinguishes Arcane Familiars and signals approachability |
| 2026-07-27 | 2D illustrated direction over 3D renders | Cheaper to produce, more memorable, aligns with "cute" positioning; competitors all chase 3D homogeneity |
| 2026-07-27 | No blockchain jargon on landing page | Lead with creature appeal and game depth; blockchain visibility deferred to Market section |
| 2026-07-27 | Fredoka + DM Sans type stack | Fredoka's rounded forms signal friendliness; DM Sans provides clean readability; together they avoid the Inter/Roboto/Space Grotesk convergence trap |
