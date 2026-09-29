import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pieceAt } from '../../src/net/queries';
import {
  inBounds,
  tileKey,
  worldToTile,
  type Tile,
} from '../../spacetimedb/src/logic/grid';
import {
  GROUND,
  OVERLAY,
  PIECE_KINDS,
} from '../../spacetimedb/src/logic/pieces';
import {
  connectClients,
  disconnectAll,
  enterAll,
  newIsland,
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

describe('building sync', () => {
  const clients: TestClient[] = [];
  let island = 0n;
  const joinAll = (all: TestClient[], prefix: string) =>
    enterAll(all, island, (i) => `${prefix} ${i}`);
  beforeEach(async () => {
    island = await newIsland();
  });
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
        () => pieceAt(viewer.conn, island, contested) !== undefined,
        'piece visible',
      );
      const seen = pieceAt(viewer.conn, island, contested)!;
      expect(seen.kind).toBe(winnerKind);
      expect(seen.placedBy.isEqual(clients[winners[0]].identity)).toBe(true);
      const onTile = [...viewer.conn.db.piece.iter()].filter(
        (p) =>
          p.islandId === island &&
          p.tileX === contested.x &&
          p.tileZ === contested.z,
      );
      expect(onTile).toHaveLength(1);
    }
  });

  it('stacks one swarm of fireflies over a piece, and removes the top piece first', async () => {
    clients.push(...(await connectClients(6)));
    await joinAll(clients, 'Stacker');
    const center = { x: 12, z: 12 };
    await clients[0].conn.reducers.placePiece({
      kind: 'tree',
      tileX: center.x,
      tileZ: center.z,
      rotation: 0,
    });

    // Six players release fireflies over the same tree at once; the overlay layer's
    // cell is unique too, so exactly one swarm lands.
    const results = await Promise.allSettled(
      clients.map((c) =>
        c.conn.reducers.placePiece({
          kind: 'fireflies',
          tileX: center.x,
          tileZ: center.z,
          rotation: 0,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const viewer of clients) {
      await waitFor(
        () => pieceAt(viewer.conn, island, center, OVERLAY) !== undefined,
        'fireflies visible',
      );
      expect(pieceAt(viewer.conn, island, center, GROUND)?.kind).toBe('tree');
    }

    const [builder, watcher] = clients;
    await builder.conn.reducers.rotatePiece({ tileX: 12, tileZ: 12 });
    await waitFor(
      () => pieceAt(watcher.conn, island, center, GROUND)?.rotation === 1,
      'the tree turned, not the fireflies',
    );
    await builder.conn.reducers.removePiece({ tileX: 12, tileZ: 12 });
    await waitFor(
      () => pieceAt(watcher.conn, island, center, OVERLAY) === undefined,
      'fireflies removed first',
    );
    expect(pieceAt(watcher.conn, island, center, GROUND)?.kind).toBe('tree');

    // No fireflies on buildings.
    await builder.conn.reducers.placePiece({
      kind: 'house',
      tileX: 13,
      tileZ: 12,
      rotation: 0,
    });
    await expect(
      builder.conn.reducers.placePiece({
        kind: 'fireflies',
        tileX: 13,
        tileZ: 12,
        rotation: 0,
      }),
    ).rejects.toThrow(/building/);
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
        () => tiles.every((t) => pieceAt(viewer.conn, island, t) !== undefined),
        'all eight pieces visible',
      );
      tiles.forEach((t, i) => {
        const seen = pieceAt(viewer.conn, island, t)!;
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
        () => tiles.every((t) => pieceAt(viewer.conn, island, t) === undefined),
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
      // Only build events: Rotator 0's own "joined" event can arrive late.
      if (e.actorName === 'Rotator 0' && e.kind !== 'joined')
        events.push(`${e.kind}:${e.pieceKind}`);
    });

    await builder.conn.reducers.placePiece({
      kind: 'well',
      tileX: tile.x,
      tileZ: tile.z,
      rotation: 3,
    });
    await builder.conn.reducers.rotatePiece({ tileX: tile.x, tileZ: tile.z });
    await waitFor(
      () => pieceAt(watcher.conn, island, tile)?.rotation === 0,
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
    const piecesHere = () =>
      [...builder.conn.db.piece.iter()].filter((p) => p.islandId === island)
        .length;
    const piecesBefore = piecesHere();

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
    expect(piecesHere()).toBe(piecesBefore);
  });
});
