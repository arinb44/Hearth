import { afterAll, describe, expect, it } from 'vitest';
import { connectClient, disconnectAll, type TestClient } from './helpers';

describe('sync smoke', () => {
  const clients: TestClient[] = [];
  afterAll(() => disconnectAll(clients));

  it('connects and receives the game_state singleton in the Lobby phase', async () => {
    const client = await connectClient();
    clients.push(client);

    const state = client.conn.db.gameState.id.find(0);
    expect(state).toBeDefined();
    expect(state!.phase.tag).toBe('Lobby');
    expect(state!.round).toBe(0);
  });
});
