import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";
import fs from "fs";

/**
 * Resolves `@/` imports to the correct source directory based on which
 * package is doing the import:
 * - Files in game/src/ → resolve to game/src/ (or packages/game-logic/src/ as fallback)
 * - All other files → resolve to frontend/src/
 */
function resolveGameAtAlias(): Plugin {
  const gameSrc = path.resolve(__dirname, "../game/src");
  const gameLogicSrc = path.resolve(__dirname, "../packages/game-logic/src");
  const frontendSrc = path.resolve(__dirname, "./src");

  function resolveInDirs(rel: string): string | null {
    const candidates = [
      path.resolve(gameSrc, rel),
      path.resolve(gameLogicSrc, rel),
    ];
    for (const candidate of candidates) {
      for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]) {
        if (fs.existsSync(candidate + ext)) {
          return candidate + ext;
        }
      }
    }
    return null;
  }

  return {
    name: "resolve-game-at-alias",
    resolveId(source, importer) {
      if (!source.startsWith("@/")) return null;
      const rel = source.slice(2);

      // If importing from game source tree, resolve using game's lookup order
      if (importer && (importer.startsWith(gameSrc) || importer.includes("/game/src/"))) {
        const resolved = resolveInDirs(rel);
        if (resolved) return resolved;
      }

      // Default: resolve within frontend/src
      return null; // Let Vite's built-in alias handle it
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    resolveGameAtAlias(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8080,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
