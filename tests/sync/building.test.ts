import { afterEach, describe, expect, it } from 'vitest';
import { pieceAt } from '../../src/net/queries';
import {
  inBounds,
  tileKey,
  worldToTile,
  type Tile,
} from '../../spacetimedb/src/logic/grid';
import { PIECE_KINDS } from '../../spacetimedb/src/logic/pieces';
import {
  connectClients,
  disconnectAll,
  waitFor,
  type TestClient,
} from './helpers';

/** The tile each player stands on, nudged so no two players share one. */
function distinctTilesUnderPlayers(
  clients: TestClient[],
  taken = new Set<number>(),
): Tile[] {
  return clients.map((c) => {
    const me = c.conn.db.player.identity.find(c.identity)!;
    const base = { x: worldToTile(me.x), z: worldToTile(me.z) };
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const tile = { x: base.x + dx, z: base.z + dz };
      const key = tileKey(tile.x, tile.z);
      if (inBounds(tile.x, tile.z) && !taken.has(key)) {
        taken.add(key);
        return tile;
      }
    }
    throw new Error('no free tile near player');
  });
}

async function joinAll(clients: TestClient[], prefix: string): Promise<void> {
  await Promise.all(
    clients.map((c, i) => c.conn.reducers.join({ name: `${prefix} ${i}` })),
  );
}

describe('building sync', () => {
  const clients: TestClient[] = [];
  afterEach(() => disconnectAll(clients));

  it('lets exactly one of eight simultaneous placements on the same tile win', async () => {
    clients.push(...(await connectClients(8)));
    await joinAll(clients, 'Racer');
    // Every player spawns within reach of the center tile.
    const contested = { x: 12, z: 12 };

    const results = await Promise.allSettled(
      clients.map((c, i) =>
        c.conn.reducers.placePiece({
          kind: PIECE_KINDS[i % PIECE_KINDS.length],
          tileX: contested.x,
          tileZ: contested.z,
          rotation: 0,
        }),
      ),
    );

    const winners = results.flatMap((r, i) =>
      r.status === 'fulfilled' ? [i] : [],
    );
    expect(winners).toHaveLength(1);
    const winnerKind = PIECE_KINDS[winners[0] % PIECE_KINDS.length];
    for (const viewer of clients) {
      await waitFor(
        () => pieceAt(viewer.conn, contested) !== undefined,
        'piece visible',
      );
      const seen = pieceAt(viewer.conn, contested)!;
      expect(seen.kind).toBe(winnerKind);
      expect(seen.placedBy.isEqual(clients[winners[0]].identity)).toBe(true);
      const onTile = [...viewer.conn.db.piece.iter()].filter(
        (p) => p.tileX === contested.x && p.tileZ === contested.z,
      );
      expect(onTile).toHaveLength(1);
    }

    // Clean up for later tests.
    await clients[winners[0]].conn.reducers.removePiece({
      tileX: 12,
      tileZ: 12,
    });
  });

  it('keeps every concurrent placement on distinct tiles, identically on all clients', async () => {
    clients.push(...(await connectClients(8)));
    await joinAll(clients, 'Builder');
    const tiles = distinctTilesUnderPlayers(clients);

    await Promise.all(
      clients.map((c, i) =>
        c.conn.reducers.placePiece({
          kind: PIECE_KINDS[i],
          tileX: tiles[i].x,
          tileZ: tiles[i].z,
          rotation: i % 4,
        }),
      ),
    );

    for (const viewer of clients) {
      await waitFor(
        () => tiles.every((t) => pieceAt(viewer.conn, t) !== undefined),
        'all eight pieces visible',
      );
      tiles.forEach((t, i) => {
        const seen = pieceAt(viewer.conn, t)!;
        expect(seen.kind).toBe(PIECE_KINDS[i]);
        expect(seen.rotation).toBe(i % 4);
      });
    }

    await Promise.all(
      clients.map((c, i) =>
        c.conn.reducers.removePiece({ tileX: tiles[i].x, tileZ: tiles[i].z }),
      ),
    );
    for (const viewer of clients) {
      await waitFor(
        () => tiles.every((t) => pieceAt(viewer.conn, t) === undefined),
        'all pieces removed everywhere',
      );
    }
  });

  it('propagates rotation and broadcasts activity events', async () => {
    clients.push(...(await connectClients(2)));
    const [builder, watcher] = clients;
    await joinAll(clients, 'Rotator');
    const [tile] = distinctTilesUnderPlayers([builder]);

    const events: string[] = [];
    watcher.conn.db.activity.onInsert((_ctx, e) => {
      if (e.actorName === 'Rotator 0') events.push(`${e.kind}:${e.pieceKind}`);
    });

    await builder.conn.reducers.placePiece({
      kind: 'well',
      tileX: tile.x,
      tileZ: tile.z,
      rotation: 3,
    });
    await builder.conn.reducers.rotatePiece({ tileX: tile.x, tileZ: tile.z });
    await waitFor(
      () => pieceAt(watcher.conn, tile)?.rotation === 0,
      'rotation wraps 3 → 0',
    );

    await builder.conn.reducers.removePiece({ tileX: tile.x, tileZ: tile.z });
    await waitFor(
      () => events.includes('removed:well'),
      'removal event received',
    );
    expect(events).toEqual(['placed:well', 'removed:well']);
    // Event rows are never kept in the client cache.
    expect(watcher.conn.db.activity.count()).toBe(0n);
  });

  it('rejects invalid placements without changing the board', async () => {
    clients.push(...(await connectClients(1)));
    const [builder] = clients;
    await joinAll(clients, 'Rule Tester');
    const [tile] = distinctTilesUnderPlayers([builder]);
    const piecesBefore = builder.conn.db.piece.count();

    const attempts = [
      { kind: 'castle', tileX: tile.x, tileZ: tile.z, rotation: 0 },
      { kind: 'house', tileX: tile.x, tileZ: tile.z, rotation: 7 },
      { kind: 'house', tileX: 200, tileZ: 0, rotation: 0 },
      { kind: 'house', tileX: 0, tileZ: 0, rotation: 0 }, // far corner: out of reach
    ];
    for (const attempt of attempts) {
      await expect(builder.conn.reducers.placePiece(attempt)).rejects.toThrow();
    }
    await expect(
      builder.conn.reducers.removePiece({ tileX: tile.x, tileZ: tile.z }),
    ).rejects.toThrow();
    expect(builder.conn.db.piece.count()).toBe(piecesBefore);
  });
});
