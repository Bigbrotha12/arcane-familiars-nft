import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveAtAlias(): Plugin {
  return {
    name: 'resolve-at-alias',
    resolveId(source, _importer) {
      if (!source.startsWith('@/')) return null;
      const rel = source.slice(2);
      const candidates = [
        path.resolve(__dirname, 'src', rel),
        path.resolve(__dirname, '../packages/game-logic/src', rel),
      ];
      for (const candidate of candidates) {
        for (const ext of ['', '.ts', '.tsx', '.js', '.jsx']) {
          if (fs.existsSync(candidate + ext)) {
            return candidate + ext;
          }
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveAtAlias()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
