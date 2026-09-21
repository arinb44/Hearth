import { afterEach, describe, expect, it } from 'vitest';
import { DbConnection } from '../../src/module_bindings';
import { IslandSubscription } from '../../src/net/island';
import { pieceAt } from '../../src/net/queries';
import {
  defaultIslandName,
  MAX_ISLAND_PLAYERS,
  MAX_ISLANDS_PER_ACCOUNT,
  NO_ISLAND,
} from '../../spacetimedb/src/logic/islands';
import { TEST_DB, TEST_HOST } from './config';
import {
  connectClient,
  connectClients,
  disconnectAll,
  enterAll,
  newIsland,
  waitFor,
  type TestClient,
} from './helpers';

interface IslandWatcher {
  conn: DbConnection;
  sub: IslandSubscription;
}

/** A client subscribed the way the browser is: to one island's rows only. */
function watchIsland(islandId: bigint): Promise<IslandWatcher> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(TEST_HOST)
      .withDatabaseName(TEST_DB)
      .onConnect((conn) => {
        const sub = new IslandSubscription(conn, (m) => reject(new Error(m)));
        sub.switchTo(islandId);
        resolve({ conn, sub });
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}

/** Every island id present in the watcher's cache, across the island tables. */
function islandsInCache(conn: DbConnection): Set<bigint> {
  return new Set(
    [
      ...conn.db.gameState.iter(),
      ...conn.db.player.iter(),
      ...conn.db.piece.iter(),
    ].map((r) => r.islandId),
  );
}

const CENTER = { x: 12, z: 12 }; // every spawn point is within reach of it

describe('islands', () => {
  const clients: TestClient[] = [];
  const watchers: IslandWatcher[] = [];
  afterEach(() => {
    disconnectAll(clients);
    for (const w of watchers) w.conn.disconnect();
    watchers.length = 0;
  });

  it('keeps boards, rounds, and subscribed rows apart on each island', async () => {
    const [islandA, islandB] = await Promise.all([newIsland(), newIsland()]);
    clients.push(...(await connectClients(2)));
    const [onA, onB] = clients;
    await enterAll([onA], islandA, () => 'On A');
    await enterAll([onB], islandB, () => 'On B');

    // The same tile on two islands: both placements succeed.
    await onA.conn.reducers.placePiece({
      kind: 'house',
      tileX: CENTER.x,
      tileZ: CENTER.z,
      rotation: 0,
    });
    await onB.conn.reducers.placePiece({
      kind: 'tower',
      tileX: CENTER.x,
      tileZ: CENTER.z,
      rotation: 0,
    });

    watchers.push(
      ...(await Promise.all([watchIsland(islandA), watchIsland(islandB)])),
    );
    const [watchA, watchB] = watchers;
    await waitFor(
      () => pieceAt(watchA.conn, islandA, CENTER)?.kind === 'house',
      'A sees its house',
    );
    await waitFor(
      () => pieceAt(watchB.conn, islandB, CENTER)?.kind === 'tower',
      'B sees its tower',
    );
    expect([...islandsInCache(watchA.conn)]).toEqual([islandA]);
    expect([...islandsInCache(watchB.conn)]).toEqual([islandB]);

    // A round on A leaves B in its lobby.
    await onA.conn.reducers.startRound({});
    await waitFor(
      () =>
        watchA.conn.db.gameState.islandId.find(islandA)?.phase.tag ===
        'Building',
      'A is building',
    );
    expect(watchB.conn.db.gameState.islandId.find(islandB)?.phase.tag).toBe(
      'Lobby',
    );
    expect(pieceAt(watchB.conn, islandB, CENTER)?.kind).toBe('tower');
  });

  it('swaps the cached rows when a client switches islands', async () => {
    const [islandA, islandB] = await Promise.all([newIsland(), newIsland()]);
    clients.push(...(await connectClients(2)));
    await enterAll([clients[0]], islandA, () => 'Stays A');
    await enterAll([clients[1]], islandB, () => 'Stays B');
    await clients[1].conn.reducers.placePiece({
      kind: 'well',
      tileX: CENTER.x,
      tileZ: CENTER.z,
      rotation: 0,
    });

    const watcher = await watchIsland(islandA);
    watchers.push(watcher);
    await waitFor(
      () => watcher.conn.db.gameState.islandId.find(islandA) !== undefined,
      'island A loaded',
    );
    watcher.sub.switchTo(islandB);
    await waitFor(
      () =>
        pieceAt(watcher.conn, islandB, CENTER)?.kind === 'well' &&
        [...islandsInCache(watcher.conn)].every((id) => id === islandB),
      'only island B rows remain',
    );
  });

  it('counts players per island as they move, leave, and lose their votes', async () => {
    const [islandA, islandB] = await Promise.all([newIsland(), newIsland()]);
    const traveller = await connectClient();
    clients.push(traveller);
    const countOf = (id: bigint) =>
      traveller.conn.db.island.id.find(id)?.playerCount;
    const me = () => traveller.conn.db.player.identity.find(traveller.identity);

    await enterAll([traveller], islandA, () => 'Traveller');
    await traveller.conn.reducers.voteTheme({ option: 'challenge:1' });
    await waitFor(() => countOf(islandA) === 1, 'counted on A');
    expect(
      traveller.conn.db.themeVote.voter.find(traveller.identity),
    ).toBeTruthy();

    await enterAll([traveller], islandB, () => 'Traveller');
    await waitFor(
      () => countOf(islandA) === 0 && countOf(islandB) === 1,
      'moved to B',
    );
    expect(me()!.islandId).toBe(islandB);
    expect(
      traveller.conn.db.themeVote.voter.find(traveller.identity),
    ).toBeFalsy();

    await traveller.conn.reducers.leaveIsland({});
    await waitFor(() => countOf(islandB) === 0, 'left B');
    expect(me()!.islandId).toBe(NO_ISLAND);
    await expect(
      traveller.conn.reducers.placePiece({
        kind: 'rock',
        tileX: CENTER.x,
        tileZ: CENTER.z,
        rotation: 0,
      }),
    ).rejects.toThrow(/Enter an island/);
  });

  it('turns players away from a full island', async () => {
    const island = await newIsland();
    clients.push(...(await connectClients(MAX_ISLAND_PLAYERS + 1)));
    const [late, ...early] = clients;
    await enterAll(early, island, (i) => `Early ${i}`);
    await expect(
      late.conn.reducers.enterIsland({ islandId: island, name: 'Late' }),
    ).rejects.toThrow(/full/);
    // Someone leaving makes room.
    await early[0].conn.reducers.leaveIsland({});
    await late.conn.reducers.enterIsland({ islandId: island, name: 'Late' });
  });

  it('lets accounts (not guests) create a few islands, and takes them there', async () => {
    clients.push(...(await connectClients(2)));
    const [guest, host] = clients;
    await expect(
      guest.conn.reducers.createIsland({ name: 'Guest Isle' }),
    ).rejects.toThrow(/account/);

    const username = 'Host ' + Math.random().toString(36).slice(2, 7);
    await host.conn.reducers.createAccount({ username });
    await expect(
      host.conn.reducers.createIsland({ name: 'ab' }),
    ).rejects.toThrow();
    await host.conn.reducers.createIsland({ name: '' });
    const hostRow = () => host.conn.db.player.identity.find(host.identity);
    await waitFor(
      () => (hostRow()?.islandId ?? NO_ISLAND) !== NO_ISLAND,
      'on the new island',
    );
    const first = host.conn.db.island.id.find(hostRow()!.islandId)!;
    expect(first.name).toBe(defaultIslandName(username));
    expect(first.playerCount).toBe(1);
    expect(hostRow()!.name).toBe(username);

    for (let i = 1; i < MAX_ISLANDS_PER_ACCOUNT; i++) {
      await host.conn.reducers.createIsland({ name: `Isle number ${i}` });
    }
    await expect(
      host.conn.reducers.createIsland({ name: 'One too many' }),
    ).rejects.toThrow(/up to/);
  });
});
