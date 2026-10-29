import Phaser from 'phaser';

// Shared UI palette + drawing helpers for all Phaser HUD layers
// (battle, exploration, world map). Matches the frontend HUD tokens in
// frontend/tailwind.config.js so both render layers look consistent.

export const C = {
  bg: 0x0a0a0f,
  primary: 0x7c5cfc,
  primaryHover: 0x6a4ae8,
  primaryLight: 0xa78bfa,
  text: '#A5A3C4',
  textLight: '#F0EFFF',
  textMuted: '#6366A1',
  muted: 0x6366a1,
  hpBar: 0x2dd4bf,
  hpBarMid: 0xf59e0b,
  hpBarLow: 0xef4444,
  mpBar: 0x6366a1,
  buttonBg: 0x3b3870,
  panelBg: 0x1e1b4b,
  border: 0x3b3870,
  cardBg: 0x2d2a5e,
  barBg: 0x1a1a2e,
  gold: 0xf59e0b,
  bossRed: 0xef4444,
};

export function getHpColor(current: number, max: number): number {
  const ratio = current / max;
  if (ratio > 0.5) return C.hpBar;
  if (ratio > 0.25) return C.hpBarMid;
  return C.hpBarLow;
}

export function drawBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  cur: number,
  max: number,
  color: number
): void {
  g.clear();
  g.fillStyle(C.barBg, 1);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, C.border, 1);
  g.strokeRect(x, y, w, h);
  const ratio = Math.max(0, Math.min(1, cur / max));
  if (ratio > 0) {
    g.fillStyle(color, 1);
    g.fillRect(x + 1, y + 1, (w - 2) * ratio, h - 2);
  }
}
