import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbConnection } from '../../src/module_bindings';
import { pieceAt, resultFor } from '../../src/net/queries';
import { worldToTile, type Tile } from '../../spacetimedb/src/logic/grid';
import {
  challengeById,
  type Challenge,
} from '../../spacetimedb/src/logic/challenges';
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

interface Placement {
  kind: string;
  x: number;
  z: number;
}

/**
 * Every piece a challenge needs, in rows of 8 around `origin` (all within reach).
 * Adjacency subjects sit directly above an anchor piece of the required kind.
 */
function layoutFor(challenge: Challenge, origin: Tile): Placement[] {
  const need = challenge.targets.flatMap((t) =>
    t.type === 'count' ? Array<string>(t.min).fill(t.kinds[0]) : [],
  );
  const take = (kind: string) => need.splice(need.indexOf(kind), 1);
  const out: Placement[] = [];
  let col = 0;
  for (const target of challenge.targets) {
    if (target.type !== 'adjacent') continue;
    const subjects = need.filter((k) => k === target.kind).length;
    for (let i = 0; i < subjects; i++, col++) {
      out.push({ kind: target.to[0], x: origin.x - 3 + col, z: origin.z });
      out.push({ kind: target.kind, x: origin.x - 3 + col, z: origin.z + 1 });
      take(target.to[0]);
      take(target.kind);
    }
  }
  let row = 0;
  for (const kind of need) {
    if (col >= 8) {
      col = 0;
      row -= 1;
    }
    out.push({ kind, x: origin.x - 3 + col, z: origin.z + row });
    col++;
  }
  return out;
}

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

  it('ends the round early with a time bonus when every target is met', async () => {
    clients.push(...(await connectClients(2)));
    const [builder, watcher] = clients;
    await enterAll(clients, island, (i) => `Finisher ${i}`);
    await builder.conn.reducers.startRound({});
    await waitFor(() => phaseOf(builder.conn) === 'Building', 'building');

    const challenge = challengeById(state(builder.conn).challengeId);
    const me = builder.conn.db.player.identity.find(builder.identity)!;
    const origin = { x: worldToTile(me.x), z: worldToTile(me.z) };
    for (const p of layoutFor(challenge, origin)) {
      await builder.conn.reducers.placePiece({
        kind: p.kind,
        tileX: p.x,
        tileZ: p.z,
        rotation: 0,
      });
    }

    const round = state(builder.conn).round;
    await waitFor(() => phaseOf(watcher.conn) === 'Scoring', 'early finish');
    await waitFor(
      () => resultFor(watcher.conn, island, round) !== undefined,
      'result row',
    );
    const result = resultFor(watcher.conn, island, round)!;
    expect(result.completed).toBe(true);
    expect(result.score).toBeGreaterThan(100);
    expect(result.stars).toBeGreaterThanOrEqual(2);
    expect(result.contributions[0].name).toBe('Finisher 0');
  });
});
