import { afterAll, describe, expect, it } from 'vitest';
import { connectClient, disconnectAll, type TestClient } from './helpers';

describe('sync smoke', () => {
  const clients: TestClient[] = [];
  afterAll(() => disconnectAll(clients));

  it('connects and receives the game_state and config singletons', async () => {
    const client = await connectClient();
    clients.push(client);

    const state = client.conn.db.gameState.id.find(0);
    expect(state).toBeDefined();
    expect(['Lobby', 'Building', 'Scoring', 'Voting', 'Results']).toContain(
      state!.phase.tag,
    );
    expect(client.conn.db.config.id.find(0)).toBeTruthy();
  });
});
