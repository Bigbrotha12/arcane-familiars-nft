import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(backendRoot, '..');
const logicSrc = path.join(repoRoot, 'packages/game-logic/src');

export interface TestEnv {
  mf: Miniflare;
  db: any;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  post: <T = any>(path: string, body: unknown) => Promise<{ status: number; body: T }>;
  get: <T = any>(path: string) => Promise<{ status: number; body: T }>;
  dispose: () => Promise<void>;
}

function logicAliasPlugin() {
  return {
    name: 'logic-alias',
    setup(build: any) {
      build.onResolve({ filter: /^@\// }, (args: { path: string }) => {
        const rel = args.path.slice(2);
        for (const ext of ['', '.ts', '/index.ts']) {
          const candidate = path.join(logicSrc, rel + ext);
          if (fs.existsSync(candidate)) return { path: candidate };
        }
        return null;
      });
    },
  };
}

async function bundleWorker(): Promise<string> {
  const result = await build({
    entryPoints: [path.join(backendRoot, 'src/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    target: 'es2022',
    plugins: [logicAliasPlugin()],
  });
  return result.outputFiles[0].text;
}

async function applyMigrations(db: any): Promise<void> {
  const dir = path.join(backendRoot, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
}

export async function createTestEnv(): Promise<TestEnv> {
  const code = await bundleWorker();
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'worker.js', contents: code }],
    compatibilityDate: '2026-07-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    bindings: { ENVIRONMENT: 'development' },
  });

  const db = await mf.getD1Database('DB');
  await applyMigrations(db);

  const api = (p: string, init?: RequestInit) =>
    mf.dispatchFetch(`http://localhost${p}`, init);

  const post = async <T = any>(p: string, body: unknown) => {
    const res = await api(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as T };
  };

  const get = async <T = any>(p: string) => {
    const res = await api(p);
    return { status: res.status, body: (await res.json()) as T };
  };

  return {
    mf,
    db,
    api,
    post,
    get,
    dispose: () => mf.dispose(),
  };
}
