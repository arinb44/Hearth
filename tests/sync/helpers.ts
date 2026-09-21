import { execFileSync } from 'node:child_process';
import type { Identity } from 'spacetimedb';
import { DbConnection } from '../../src/module_bindings';
import { NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import { SPACETIME_CLI, TEST_DB, TEST_HOST } from './config';

export interface TestClient {
  conn: DbConnection;
  identity: Identity;
  token: string;
}

/** Connects a real SDK client and resolves once its subscription snapshot has arrived. */
export function connectClient(token?: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(TEST_HOST)
      .withDatabaseName(TEST_DB)
      .withToken(token)
      .onConnect((conn, identity, newToken) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, identity, token: newToken }))
          .onError(() => reject(new Error('Subscription failed')))
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}

export function connectClients(count: number): Promise<TestClient[]> {
  return Promise.all(Array.from({ length: count }, () => connectClient()));
}

export function disconnectAll(clients: TestClient[]): void {
  for (const client of clients) client.conn.disconnect();
  clients.length = 0;
}

/** Polls until `check` passes, so assertions wait for subscription updates to land. */
export async function waitFor(
  check: () => boolean,
  label: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * Creates a fresh island for one test, which also keeps tests apart: a throwaway
 * account creates it, steps off it again, and disconnects.
 */
export async function newIsland(): Promise<bigint> {
  const owner = await connectClient();
  try {
    const tag = Math.random().toString(36).slice(2, 8);
    await owner.conn.reducers.createAccount({ username: `Owner ${tag}` });
    await owner.conn.reducers.createIsland({ name: `Test ${tag}` });
    const islandOf = () =>
      owner.conn.db.player.identity.find(owner.identity)?.islandId ?? NO_ISLAND;
    await waitFor(() => islandOf() !== NO_ISLAND, 'owner on the new island');
    const islandId = islandOf();
    await owner.conn.reducers.leaveIsland({});
    return islandId;
  } finally {
    owner.conn.disconnect();
  }
}

/** Puts every client on the island under the given names (ignored for accounts). */
export async function enterAll(
  clients: TestClient[],
  islandId: bigint,
  name: (index: number) => string,
): Promise<void> {
  await Promise.all(
    clients.map((c, i) =>
      c.conn.reducers.enterIsland({ islandId, name: name(i) }),
    ),
  );
}

/** Calls a reducer as the admin (the CLI identity that published the test module). */
export function adminCall(reducer: string, ...args: string[]): void {
  execFileSync(
    SPACETIME_CLI,
    ['call', TEST_DB, reducer, ...args, '--server', 'local'],
    {
      stdio: 'pipe',
    },
  );
}

export interface AccountClient extends TestClient {
  username: string;
  accountId: bigint;
}

/** Connects a client and creates an account for it; usernames are unique per run. */
export async function connectWithAccount(base: string): Promise<AccountClient> {
  const client = await connectClient();
  const username = base + Math.random().toString(36).slice(2, 7);
  await client.conn.reducers.createAccount({ username });
  const mine = () =>
    [...client.conn.db.account.iter()].find((a) =>
      a.owner.isEqual(client.identity),
    );
  await waitFor(() => mine() !== undefined, `${username}'s account`);
  return { ...client, username, accountId: mine()!.id };
}

/**
 * Waits until the client has received every update committed before this call.
 * Updates reach a client in commit order, so once its own later change (a fresh
 * recovery code) arrives, everything earlier has too.
 */
export async function settle(client: AccountClient): Promise<void> {
  const code = () => [...client.conn.db.myRecoveryCode.iter()][0]?.recoveryCode;
  await waitFor(() => code() !== undefined, `${client.username}'s code`);
  const before = code();
  await client.conn.reducers.newRecoveryCode({});
  await waitFor(() => code() !== before, `${client.username} settled`);
}
