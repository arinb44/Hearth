import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SAVED_BUILDS } from '../../spacetimedb/src/logic/builds';
import { worldToTile } from '../../spacetimedb/src/logic/grid';
import { NO_ISLAND, NO_OWNER } from '../../spacetimedb/src/logic/islands';
import { TEST_TIMING } from './config';
import {
  adminCall,
  connectClient,
  connectWithAccount,
  disconnectAll,
  settle,
  waitFor,
  type AccountClient,
  type TestClient,
} from './helpers';

const buildsIn = (c: TestClient) => [...c.conn.db.savedBuild.iter()];
const islandOf = (c: TestClient) =>
  c.conn.db.player.identity.find(c.identity)?.islandId ?? NO_ISLAND;

/** The island's board as sorted "kind@x,z/rotation" strings, for comparing. */
function board(c: TestClient, islandId: bigint): string[] {
  return [...c.conn.db.piece.iter()]
    .filter((p) => p.islandId === islandId)
    .map((p) => `${p.kind}@${p.tileX},${p.tileZ}/${p.rotation}`)
    .sort();
}

/** An account on its own new island; returns its island id and spawn tile. */
async function hostOnOwnIsland(c: AccountClient) {
  await c.conn.reducers.createIsland({ name: `Isle ${c.username}` });
  await waitFor(() => islandOf(c) !== NO_ISLAND, 'host on the island');
  const me = c.conn.db.player.identity.find(c.identity)!;
  return {
    islandId: me.islandId,
    x: worldToTile(me.x),
    z: worldToTile(me.z),
  };
}

describe('saved builds', () => {
  const clients: TestClient[] = [];
  afterEach(() => disconnectAll(clients));

  it('saves a board that only its owner sees, and loads it back in the lobby', async () => {
    const host = await connectWithAccount('Host');
    const visitor = await connectWithAccount('Visit');
    clients.push(host, visitor);
    const { islandId, x, z } = await hostOnOwnIsland(host);
    await visitor.conn.reducers.enterIsland({ islandId, name: '' });

    const place = (kind: string, tileX: number, tileZ: number, rotation = 0) =>
      host.conn.reducers.placePiece({ kind, tileX, tileZ, rotation });
    await place('house', x, z, 1);
    await place('tree', x + 1, z);
    await place('path', x, z + 1, 2);
    await waitFor(() => board(host, islandId).length === 3, 'three pieces');
    const saved = board(host, islandId);

    await host.conn.reducers.saveBuild({ name: '  First   town ' });
    await waitFor(() => buildsIn(host).length === 1, 'host sees the build');
    const build = buildsIn(host)[0];
    expect(build.name).toBe('First town');
    expect(build.pieces).toHaveLength(3);
    await settle(visitor);
    expect(buildsIn(visitor)).toHaveLength(0);

    // Change the board, then load the build over it.
    await host.conn.reducers.removePiece({ tileX: x + 1, tileZ: z });
    await place('rock', x - 1, z);
    await waitFor(
      () => board(host, islandId).includes(`rock@${x - 1},${z}/0`),
      'rock',
    );
    await host.conn.reducers.loadBuild({ buildId: build.id });
    await waitFor(
      () => board(host, islandId).join() === saved.join(),
      'host board restored',
    );
    await waitFor(
      () => board(visitor, islandId).join() === saved.join(),
      'visitor sees the same board',
    );
  });

  it('rejects guests, empty boards, other islands, running rounds, and too many builds', async () => {
    const host = await connectWithAccount('Host');
    const visitor = await connectWithAccount('Visit');
    const guest = await connectClient();
    clients.push(host, visitor, guest);
    const { islandId, x, z } = await hostOnOwnIsland(host);

    await expect(
      host.conn.reducers.saveBuild({ name: 'Empty' }),
    ).rejects.toThrow(/empty/);
    await host.conn.reducers.placePiece({
      kind: 'tree',
      tileX: x,
      tileZ: z,
      rotation: 0,
    });
    await expect(host.conn.reducers.saveBuild({ name: '   ' })).rejects.toThrow(
      /name/,
    );
    await host.conn.reducers.saveBuild({ name: 'Tree' });
    await waitFor(() => buildsIn(host).length === 1, 'saved');
    const hostBuild = buildsIn(host)[0];

    await guest.conn.reducers.enterIsland({ islandId, name: 'Guest' });
    await expect(
      guest.conn.reducers.saveBuild({ name: 'Mine' }),
    ).rejects.toThrow(/account/);

    // A visitor can save the board, but not load anything onto someone else's island.
    await visitor.conn.reducers.enterIsland({ islandId, name: '' });
    await visitor.conn.reducers.saveBuild({ name: 'Copied' });
    await waitFor(() => buildsIn(visitor).length === 1, 'visitor saved a copy');
    await expect(
      visitor.conn.reducers.loadBuild({ buildId: buildsIn(visitor)[0].id }),
    ).rejects.toThrow(/own island/);
    await expect(
      visitor.conn.reducers.loadBuild({ buildId: hostBuild.id }),
    ).rejects.toThrow(/gone/);
    await expect(
      visitor.conn.reducers.deleteBuild({ buildId: hostBuild.id }),
    ).rejects.toThrow(/gone/);

    // Up to MAX_SAVED_BUILDS each; deleting one frees a slot.
    for (let i = 1; i < MAX_SAVED_BUILDS; i++) {
      await host.conn.reducers.saveBuild({ name: `Copy ${i}` });
    }
    await expect(
      host.conn.reducers.saveBuild({ name: 'One more' }),
    ).rejects.toThrow(/up to/);
    await host.conn.reducers.deleteBuild({ buildId: hostBuild.id });
    await host.conn.reducers.saveBuild({ name: 'One more' });
    await waitFor(
      () => buildsIn(host).some((b) => b.name === 'One more'),
      'saved after deleting',
    );

    await host.conn.reducers.startRound({});
    await expect(
      host.conn.reducers.loadBuild({ buildId: buildsIn(host)[0].id }),
    ).rejects.toThrow(/lobby/);
  });

  it('starts rounds on its own only on the main island', async () => {
    const host = await connectWithAccount('Host');
    const walker = await connectWithAccount('Walk');
    clients.push(host, walker);
    const main = [...walker.conn.db.island.iter()].find(
      (i) => i.ownerAccountId === NO_OWNER,
    )!;
    const t = TEST_TIMING;
    const setLobbySeconds = (lobby: number) =>
      adminCall(
        'configure_timing',
        ...[
          lobby,
          t.buildSeconds,
          t.scoringSeconds,
          t.votingSeconds,
          t.resultsSeconds,
          t.showcaseSeconds,
        ].map(String),
      );
    setLobbySeconds(30);
    try {
      const { islandId } = await hostOnOwnIsland(host);
      await walker.conn.reducers.enterIsland({ islandId: main.id, name: '' });
      await waitFor(
        () =>
          walker.conn.db.gameState.islandId.find(main.id)?.phaseEndsAt !==
          undefined,
        'main island lobby countdown',
      );
      await settle(host);
      const own = host.conn.db.gameState.islandId.find(islandId)!;
      expect(own.phase.tag).toBe('Lobby');
      expect(own.phaseEndsAt).toBeUndefined();
    } finally {
      setLobbySeconds(t.lobbySeconds);
      // Back to an idle main island, so its countdown cannot start a round later.
      adminCall('reset_game', String(main.id));
    }
  });
});
