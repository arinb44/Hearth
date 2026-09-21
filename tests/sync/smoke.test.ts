import { afterAll, describe, expect, it } from 'vitest';
import {
  MAIN_ISLAND_NAME,
  NO_OWNER,
} from '../../spacetimedb/src/logic/islands';
import { connectClient, disconnectAll, type TestClient } from './helpers';

describe('sync smoke', () => {
  const clients: TestClient[] = [];
  afterAll(() => disconnectAll(clients));

  it('connects and receives the main island, its game_state, and config', async () => {
    const client = await connectClient();
    clients.push(client);

    const main = [...client.conn.db.island.iter()].find(
      (i) => i.ownerAccountId === NO_OWNER,
    );
    expect(main?.name).toBe(MAIN_ISLAND_NAME);
    const state = client.conn.db.gameState.islandId.find(main!.id);
    expect(state).toBeDefined();
    expect(['Lobby', 'Building', 'Scoring', 'Voting', 'Results']).toContain(
      state!.phase.tag,
    );
    expect(client.conn.db.config.id.find(0)).toBeTruthy();
  });
});
