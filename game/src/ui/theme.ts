import Phaser from 'phaser';

// Shared UI palette + drawing helpers for all Phaser HUD layers
// (battle, exploration, world map). Matches the frontend HUD tokens in
// frontend/tailwind.config.js so both render layers look consistent.

export const C = {
  bg: 0x0A0A0F,
  primary: 0x7C5CFC,
  primaryHover: 0x6A4AE8,
  primaryLight: 0xA78BFA,
  text: '#A5A3C4',
  textLight: '#F0EFFF',
  textMuted: '#6366A1',
  muted: 0x6366A1,
  hpBar: 0x2DD4BF,
  hpBarMid: 0xF59E0B,
  hpBarLow: 0xEF4444,
  mpBar: 0x6366A1,
  buttonBg: 0x3B3870,
  panelBg: 0x1E1B4B,
  border: 0x3B3870,
  cardBg: 0x2D2A5E,
  barBg: 0x1A1A2E,
  gold: 0xF59E0B,
  bossRed: 0xEF4444,
};

export function getHpColor(current: number, max: number): number {
  const ratio = current / max;
  if (ratio > 0.5) return C.hpBar;
  if (ratio > 0.25) return C.hpBarMid;
  return C.hpBarLow;
}

export function drawBar(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  cur: number, max: number, color: number,
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