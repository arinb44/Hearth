import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbConnection } from '../../src/module_bindings';
import { pieceAt, resultFor } from '../../src/net/queries';
import { worldToTile } from '../../spacetimedb/src/logic/grid';
import { challengeById } from '../../spacetimedb/src/logic/challenges';
import { TEST_TIMING } from './config';
import {
  connectClients,
  disconnectAll,
  enterAll,
  newIsland,
  waitFor,
  type TestClient,
} from './helpers';

let island = 0n;
const state = (conn: DbConnection) => conn.db.gameState.islandId.find(island)!;
const phaseOf = (conn: DbConnection) => state(conn).phase.tag;

describe('round engine', () => {
  const clients: TestClient[] = [];
  beforeEach(async () => {
    island = await newIsland();
  });
  afterEach(() => disconnectAll(clients));

  it('keeps admin controls away from players', async () => {
    clients.push(...(await connectClients(1)));
    const [player] = clients;
    await enterAll([player], island, () => 'Not Admin');
    await expect(
      player.conn.reducers.skipPhase({ islandId: island }),
    ).rejects.toThrow();
    await expect(
      player.conn.reducers.resetGame({ islandId: island }),
    ).rejects.toThrow();
    await expect(
      player.conn.reducers.configureTiming({
        lobbySeconds: 0,
        buildSeconds: 1,
        scoringSeconds: 1,
        votingSeconds: 1,
        resultsSeconds: 1,
        showcaseSeconds: 1,
      }),
    ).rejects.toThrow();
    expect(player.conn.db.config.id.find(0)!.buildSeconds).toBe(
      TEST_TIMING.buildSeconds,
    );
  });

  it('runs a full timed round identically on every client', async () => {
    clients.push(...(await connectClients(3)));
    const [starter, other, watcher] = clients;
    await enterAll(clients, island, (i) => `Round ${i}`);
    const me = starter.conn.db.player.identity.find(starter.identity)!;
    const tile = { x: worldToTile(me.x), z: worldToTile(me.z) };
    await starter.conn.reducers.placePiece({
      kind: 'rock',
      tileX: tile.x,
      tileZ: tile.z,
      rotation: 0,
    });
    const roundBefore = state(watcher.conn).round;

    await starter.conn.reducers.startRound({});
    await expect(other.conn.reducers.startRound({})).rejects.toThrow();

    for (const c of clients) {
      await waitFor(
        () =>
          phaseOf(c.conn) === 'Building' &&
          pieceAt(c.conn, island, tile) === undefined,
        'building phase with a cleared board',
      );
    }
    const ends = clients.map(
      (c) => state(c.conn).phaseEndsAt!.microsSinceUnixEpoch,
    );
    expect(new Set(ends).size).toBe(1);
    expect(state(watcher.conn).round).toBe(roundBefore + 1);
    expect(state(watcher.conn).themeTitle).toBe(
      challengeById(state(watcher.conn).challengeId).title,
    );

    // The scheduled timer ends the round; building is frozen while scoring.
    await waitFor(
      () => phaseOf(watcher.conn) === 'Scoring',
      'timer ends building',
      8_000,
    );
    await expect(
      starter.conn.reducers.placePiece({
        kind: 'rock',
        tileX: tile.x,
        tileZ: tile.z,
        rotation: 0,
      }),
    ).rejects.toThrow();
    const round = state(watcher.conn).round;
    for (const c of clients) {
      await waitFor(
        () => resultFor(c.conn, island, round) !== undefined,
        'result row',
      );
    }
    const result = resultFor(watcher.conn, island, round)!;
    expect(result.completed).toBe(false);
    expect(result.score).toBe(state(watcher.conn).teamScore);

    await waitFor(
      () => phaseOf(watcher.conn) === 'Results',
      'results phase',
      5_000,
    );
    await waitFor(
      () => phaseOf(watcher.conn) === 'Lobby',
      'back to lobby',
      5_000,
    );
    expect(state(watcher.conn).phaseEndsAt).toBeUndefined(); // auto-start is off in tests
  });

  it('builds for the full time, then scores every piece with combos doubled', async () => {
    clients.push(...(await connectClients(2)));
    const [builder, watcher] = clients;
    await enterAll(clients, island, (i) => `Combo ${i}`);
    await builder.conn.reducers.startRound({});
    await waitFor(() => phaseOf(builder.conn) === 'Building', 'building');
    const round = state(builder.conn).round;

    const me = builder.conn.db.player.identity.find(builder.identity)!;
    const x = worldToTile(me.x);
    const z = worldToTile(me.z);
    // Lamp by a path (2 + 1), fireflies over a tree (2 + 1), and a lone rock (1).
    const pieces = [
      { kind: 'path', tileX: x, tileZ: z },
      { kind: 'lamp', tileX: x + 1, tileZ: z },
      { kind: 'tree', tileX: x, tileZ: z + 1 },
      { kind: 'fireflies', tileX: x, tileZ: z + 1 },
      { kind: 'rock', tileX: x - 1, tileZ: z - 1 },
    ];
    for (const p of pieces) {
      await builder.conn.reducers.placePiece({ ...p, rotation: 0 });
    }
    // No objectives: the round keeps going until its time is up.
    expect(phaseOf(watcher.conn)).toBe('Building');

    await waitFor(
      () => phaseOf(watcher.conn) === 'Scoring',
      'timer ends building',
      8_000,
    );
    for (const c of clients) {
      await waitFor(
        () => resultFor(c.conn, island, round) !== undefined,
        'result row',
      );
    }
    const result = resultFor(watcher.conn, island, round)!;
    expect(result.score).toBe(7);
    expect(result.stars).toBe(0);
    expect(result.completed).toBe(false);
    expect(state(watcher.conn).teamScore).toBe(7);
    expect(result.contributions[0]).toMatchObject({
      name: 'Combo 0',
      pieces: 5,
    });
  });
});
