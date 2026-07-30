import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";

const gameSrc = path.resolve(__dirname, "../game/src");
const gameLogicSrc = path.resolve(__dirname, "../packages/game-logic/src");

export default defineConfig({
  plugins: [
    react(),
    svgr(),
  ],
  resolve: {
    alias: [
      // Game-specific @/ sub-path aliases (must come before general @/ alias)
      // Note: trailing path separator is critical — it's concatenated with the remainder after the match
      { find: /^@\/types\//, replacement: gameLogicSrc + "/types/" },
      { find: /^@\/data\//, replacement: gameLogicSrc + "/data/" },
      { find: /^@\/utils\//, replacement: gameLogicSrc + "/utils/" },
      // General @/ alias for frontend code
      { find: /^@\//, replacement: __dirname + "/src/" },
      // Game package entry
      { find: "@arcane-familiars/game", replacement: path.resolve(gameSrc, "index.ts") },
    ],
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
