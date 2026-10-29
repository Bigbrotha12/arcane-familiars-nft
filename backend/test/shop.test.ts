import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import type { GameState } from '@arcane-familiars/game-logic';

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'development' };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: Record<string, unknown>, ip: string): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

function makeState(anonId: string, currency: number): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

async function seed(anonId: string, currency: number): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
     VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonId, JSON.stringify(makeState(anonId, currency)))
    .run();
}

describe('shop', () => {
  it('buys a potion and deducts the price', async () => {
    const anonId = 'anon-shop-buy';
    await seed(anonId, 100);

    const res = await fetchApp(post('/api/game/shop/buy', { anonymousId: anonId, itemId: 'potion_small' }, '10.9.0.1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: GameState };
    expect(body.state.inventory.currency).toBe(75);
    expect(body.state.inventory.items).toEqual([{ itemId: 'potion_small', quantity: 1 }]);
  });

  it('rejects an unaffordable purchase', async () => {
    const anonId = 'anon-shop-poor';
    await seed(anonId, 10);

    const res = await fetchApp(post('/api/game/shop/buy', { anonymousId: anonId, itemId: 'potion_small' }, '10.9.0.2'));
    expect(res.status).toBe(400);
  });

  it('rejects an item that is not for sale', async () => {
    const anonId = 'anon-shop-unknown';
    await seed(anonId, 1000);

    const res = await fetchApp(post('/api/game/shop/buy', { anonymousId: anonId, itemId: 'shadowLord' }, '10.9.0.3'));
    expect(res.status).toBe(400);
  });
});
