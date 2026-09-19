import { execFileSync } from 'node:child_process';
import type { Identity } from 'spacetimedb';
import { DbConnection } from '../../src/module_bindings';
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
