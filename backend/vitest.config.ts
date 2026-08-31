import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // `@arcane-familiars/game-logic` uses a `@/*` subpath import that must
    // resolve to its own `src` when the Worker source (and this Worker's test)
    // imports it.
    alias: {
      "@": path.resolve(__dirname, "../packages/game-logic/src"),
    },
  },
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(__dirname, "migrations");
      const migrations = await readD1Migrations(migrationsPath);

      return {
        // Load `main`, compatibility settings and bindings from wrangler.jsonc
        // (including the in-memory D1 `DB` binding for local tests).
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityDate: "2026-07-01",
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            // Tests override ENVIRONMENT per-request, but default to the most
            // restrictive mode so a missed override can't silently allow
            // anonymous access.
            ENVIRONMENT: "production",
            IMMUTABLE_CLIENT_ID: "test-client-id",
            IMMUTABLE_AUTH_ISSUER: "https://auth.immutable.com/",
            IMMUTABLE_JWKS_URI: "https://auth.immutable.com/.well-known/jwks.json",
            // Test-only binding used by the migrations setup file.
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    // Applies all D1 migrations to the in-memory DB before tests run.
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
