import { afterEach, describe, expect, it } from 'vitest';
import type { DbConnection } from '../../src/module_bindings';
import { otherAccount } from '../../spacetimedb/src/logic/friends';
import { NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import {
  connectClient,
  connectWithAccount,
  disconnectAll,
  newIsland,
  settle,
  waitFor,
  type AccountClient,
  type TestClient,
} from './helpers';

const requestsIn = (c: TestClient) => [...c.conn.db.friendRequest.iter()];
const friendshipsIn = (c: TestClient) => [...c.conn.db.friendship.iter()];
const accountById = (conn: DbConnection, id: bigint) =>
  conn.db.account.id.find(id) ?? undefined;

/** Ada asks Bob, Bob accepts; resolves once both see the friendship. */
async function makeFriends(a: AccountClient, b: AccountClient): Promise<void> {
  await a.conn.reducers.sendFriendRequest({ username: b.username });
  await waitFor(() => requestsIn(b).length === 1, 'request arrives');
  await b.conn.reducers.acceptFriendRequest({ requestId: requestsIn(b)[0].id });
  await waitFor(
    () => friendshipsIn(a).length === 1 && friendshipsIn(b).length === 1,
    'both see the friendship',
  );
}

describe('friends', () => {
  const clients: TestClient[] = [];
  afterEach(() => disconnectAll(clients));

  it('shows requests and friendships only to the two players involved', async () => {
    const ada = await connectWithAccount('Ada');
    const bob = await connectWithAccount('Bob');
    const eve = await connectWithAccount('Eve');
    clients.push(ada, bob, eve);

    // Usernames match ignoring case.
    await ada.conn.reducers.sendFriendRequest({
      username: bob.username.toUpperCase(),
    });
    await waitFor(() => requestsIn(bob).length === 1, 'Bob sees the request');
    expect(requestsIn(ada)).toHaveLength(1);
    expect(requestsIn(bob)[0]).toMatchObject({
      fromAccountId: ada.accountId,
      toAccountId: bob.accountId,
    });
    await settle(eve);
    expect(requestsIn(eve)).toHaveLength(0);

    await bob.conn.reducers.acceptFriendRequest({
      requestId: requestsIn(bob)[0].id,
    });
    await waitFor(
      () => friendshipsIn(ada).length === 1 && friendshipsIn(bob).length === 1,
      'both see the friendship',
    );
    await waitFor(
      () => requestsIn(ada).length === 0 && requestsIn(bob).length === 0,
      'the request is gone',
    );
    const friendship = friendshipsIn(ada)[0];
    expect(otherAccount(friendship, ada.accountId)).toBe(bob.accountId);
    expect(otherAccount(friendship, bob.accountId)).toBe(ada.accountId);

    await settle(eve);
    expect(friendshipsIn(eve)).toHaveLength(0);
    // A client that subscribes afterwards does not get them in its snapshot either.
    const late = await connectClient();
    clients.push(late);
    expect(requestsIn(late)).toHaveLength(0);
    expect(friendshipsIn(late)).toHaveLength(0);
  });

  it('rejects guests, unknown names, yourself, duplicates, and existing friends', async () => {
    const ada = await connectWithAccount('Ada');
    const bob = await connectWithAccount('Bob');
    const guest = await connectClient();
    clients.push(ada, bob, guest);

    await expect(
      guest.conn.reducers.sendFriendRequest({ username: ada.username }),
    ).rejects.toThrow(/account/);
    await expect(
      ada.conn.reducers.sendFriendRequest({ username: 'nobody-here-x' }),
    ).rejects.toThrow(/No player/);
    await expect(
      ada.conn.reducers.sendFriendRequest({ username: ada.username }),
    ).rejects.toThrow(/yourself/);

    await ada.conn.reducers.sendFriendRequest({ username: bob.username });
    await expect(
      ada.conn.reducers.sendFriendRequest({ username: bob.username }),
    ).rejects.toThrow(/already asked/);
    await waitFor(() => requestsIn(ada).length === 1, 'Ada sees her request');
    // Only the recipient can accept.
    await expect(
      ada.conn.reducers.acceptFriendRequest({
        requestId: requestsIn(ada)[0].id,
      }),
    ).rejects.toThrow(/gone/);

    await bob.conn.reducers.acceptFriendRequest({
      requestId: requestsIn(ada)[0].id,
    });
    await expect(
      bob.conn.reducers.sendFriendRequest({ username: ada.username }),
    ).rejects.toThrow(/already friends/);
  });

  it('accepts a request sent back, and supports decline, cancel, and remove', async () => {
    const ada = await connectWithAccount('Ada');
    const bob = await connectWithAccount('Bob');
    clients.push(ada, bob);

    // Asking someone who already asked you makes you friends.
    await ada.conn.reducers.sendFriendRequest({ username: bob.username });
    await bob.conn.reducers.sendFriendRequest({ username: ada.username });
    await waitFor(
      () => friendshipsIn(ada).length === 1 && friendshipsIn(bob).length === 1,
      'friends after asking back',
    );
    expect(requestsIn(bob)).toHaveLength(0);

    await bob.conn.reducers.removeFriend({ accountId: ada.accountId });
    await waitFor(
      () => friendshipsIn(ada).length === 0 && friendshipsIn(bob).length === 0,
      'friendship removed for both',
    );
    await expect(
      bob.conn.reducers.removeFriend({ accountId: ada.accountId }),
    ).rejects.toThrow(/not friends/);

    // The recipient declines.
    await ada.conn.reducers.sendFriendRequest({ username: bob.username });
    await waitFor(() => requestsIn(bob).length === 1, 'second request');
    await bob.conn.reducers.declineFriendRequest({
      requestId: requestsIn(bob)[0].id,
    });
    await waitFor(() => requestsIn(ada).length === 0, 'declined');

    // The sender takes a request back.
    await ada.conn.reducers.sendFriendRequest({ username: bob.username });
    await waitFor(() => requestsIn(ada).length === 1, 'third request');
    await ada.conn.reducers.declineFriendRequest({
      requestId: requestsIn(ada)[0].id,
    });
    await waitFor(() => requestsIn(bob).length === 0, 'cancelled');
    expect(friendshipsIn(bob)).toHaveLength(0);
  });

  it("shows a friend's presence and island, and lets you join them", async () => {
    const ada = await connectWithAccount('Ada');
    const bob = await connectWithAccount('Bob');
    clients.push(ada, bob);
    await makeFriends(ada, bob);
    const adaSeenByBob = () => {
      const friendship = friendshipsIn(bob)[0];
      return accountById(bob.conn, otherAccount(friendship, bob.accountId));
    };
    await waitFor(() => adaSeenByBob()?.online === true, 'Ada online');
    expect(adaSeenByBob()!.islandId).toBe(NO_ISLAND);

    const islandId = await newIsland();
    await ada.conn.reducers.enterIsland({ islandId, name: '' });
    await waitFor(
      () => adaSeenByBob()?.islandId === islandId,
      "Bob sees Ada's island",
    );

    // Join: Bob enters the island his friend is on.
    await bob.conn.reducers.enterIsland({
      islandId: adaSeenByBob()!.islandId,
      name: '',
    });
    await waitFor(
      () =>
        bob.conn.db.player.identity.find(bob.identity)?.islandId === islandId,
      'Bob is on the same island',
    );
    await waitFor(
      () => accountById(ada.conn, bob.accountId)?.islandId === islandId,
      "Bob's presence follows him",
    );

    await ada.conn.reducers.leaveIsland({});
    await waitFor(
      () => adaSeenByBob()?.islandId === NO_ISLAND,
      'Ada back on the main screen',
    );
    expect(adaSeenByBob()!.online).toBe(true);

    ada.conn.disconnect();
    clients.splice(clients.indexOf(ada), 1);
    await waitFor(() => adaSeenByBob()?.online === false, 'Ada offline');
  });
});
