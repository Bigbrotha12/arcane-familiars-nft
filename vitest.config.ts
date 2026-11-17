import { defineConfig, type Plugin } from 'vitest/config';
import path from 'node:path';
import fs from 'node:fs';

// Frontend HUD tests live outside a workspace package and import both the
// frontend source and the game/game-logic sources, each of which uses `@/` for
// its own root. Mirror the importer-aware alias resolution from
// frontend/vite.config.ts so those tests run from the repository root.
const root = process.cwd();
const gameSrc = path.resolve(root, 'game/src');
const gameLogicSrc = path.resolve(root, 'packages/game-logic/src');
const frontendSrc = path.resolve(root, 'frontend/src');

function resolveIn(base: string, rel: string): string | null {
  const candidates = [path.resolve(base, rel)];
  if (base === gameSrc) candidates.push(path.resolve(gameLogicSrc, rel));

  for (const candidate of candidates) {
    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
      if (fs.existsSync(candidate + ext)) return candidate + ext;
    }
  }
  return null;
}

function resolveAtAlias(): Plugin {
  return {
    name: 'resolve-at-alias',
    resolveId(source, importer) {
      if (!source.startsWith('@/')) return null;
      const rel = source.slice(2);
      if (importer?.startsWith(gameSrc)) return resolveIn(gameSrc, rel);
      if (importer?.startsWith(gameLogicSrc)) return resolveIn(gameLogicSrc, rel);
      return resolveIn(frontendSrc, rel);
    },
  };
}

export default defineConfig({
  plugins: [resolveAtAlias()],
  resolve: {
    alias: [{ find: '@/game', replacement: path.resolve(gameSrc, 'index.ts') }],
  },
});
