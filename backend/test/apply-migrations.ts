import { beforeAll } from "vitest";
import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS as unknown as D1Migration[]);
});
