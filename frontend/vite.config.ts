import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";
import fs from "fs";

const gameSrc = path.resolve(__dirname, "../game/src");
const gameLogicSrc = path.resolve(__dirname, "../packages/game-logic/src");
const frontendSrc = path.resolve(__dirname, "./src");

function resolveGameAtAlias(): Plugin {
  return {
    name: "resolve-game-at-alias",
    resolveId(source, importer) {
      if (!source.startsWith("@/")) return null;

      const rel = source.slice(2);

      // If importing from game source, resolve @/ to game/src
      if (importer?.startsWith(gameSrc)) {
        const candidates = [
          path.resolve(gameSrc, rel),
          path.resolve(gameLogicSrc, rel),
        ];
        for (const candidate of candidates) {
          for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
            if (fs.existsSync(candidate + ext)) {
              return candidate + ext;
            }
          }
        }
      }

      // If importing from game-logic source, resolve @/ to game-logic/src
      if (importer?.startsWith(gameLogicSrc)) {
        for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
          const candidate = path.resolve(gameLogicSrc, rel) + ext;
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }

      // Default: resolve @/ to frontend/src
      for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
        const candidate = path.resolve(frontendSrc, rel) + ext;
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    resolveGameAtAlias(),
    nodePolyfills({ include: ['crypto', 'buffer', 'process', 'stream', 'util', 'events', 'http', 'https', 'url', 'zlib'] }),
  ],
  resolve: {
    alias: [
      { find: "@/game", replacement: path.resolve(gameSrc, "index.ts") },
    ],
  },
  server: {
    port: 8080,
    open: true,
    allowedHosts: process.env.VITE_ALLOW_ALL_HOSTS === "1" ? true : undefined,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
