import type { Identity } from 'spacetimedb';
import { DbConnection, tables } from '../module_bindings';
import { STDB_DB_NAME, STDB_HOST, STORAGE_SUFFIX } from '../config';

export type ConnectionStatus =
  'connecting' | 'connected' | 'disconnected' | 'error';

export interface ConnectionEvents {
  onStatus(status: ConnectionStatus, detail?: string): void;
  /** Fires once the initial subscription snapshot is in the client cache. */
  onReady(conn: DbConnection, identity: Identity): void;
}

// Tokens are per server + database, so a local token is never sent to Maincloud.
const TOKEN_KEY = `coop-builder:token:${STDB_HOST}/${STDB_DB_NAME}${STORAGE_SUFFIX}`;

function loadToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode): the player gets a fresh identity next visit.
  }
}

export function connect(events: ConnectionEvents): DbConnection {
  events.onStatus('connecting');
  return DbConnection.builder()
    .withUri(STDB_HOST)
    .withDatabaseName(STDB_DB_NAME)
    .withToken(loadToken())
    .onConnect((conn, identity, token) => {
      saveToken(token);
      conn
        .subscriptionBuilder()
        .onApplied(() => {
          events.onStatus('connected');
          events.onReady(conn, identity);
        })
        .onError(() => events.onStatus('error', 'Subscription failed'))
        // Always-on rows: accounts, islands, your own player row (which says which
        // island you are on), and your friends and builds (the module's visibility
        // filters send only your own). Island rows come from IslandSubscription.
        .subscribe([
          tables.config,
          tables.account,
          tables.myRecoveryCode,
          tables.island,
          tables.player.where((r) => r.identity.eq(identity)),
          tables.friendRequest,
          tables.friendship,
          tables.savedBuild,
        ]);
    })
    .onDisconnect(() => events.onStatus('disconnected'))
    .onConnectError((_ctx, error) => events.onStatus('error', error.message))
    .build();
}
