import { afterEach, describe, expect, it } from 'vitest';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '../../src/module_bindings';
import { worldToTile } from '../../spacetimedb/src/logic/grid';
import { formatRecoveryCode } from '../../spacetimedb/src/logic/accounts';
import {
  connectClient,
  connectClients,
  disconnectAll,
  enterAll,
  newIsland,
  waitFor,
  type TestClient,
} from './helpers';

let counter = 0;
/** Usernames must be unique across the whole run. */
const uniqueName = (base: string) => `${base}${++counter}${Date.now() % 1000}`;

const accountOf = (conn: DbConnection, who: Identity) =>
  [...conn.db.account.iter()].find((a) => a.owner.isEqual(who));
const myCode = (conn: DbConnection) =>
  [...conn.db.myRecoveryCode.iter()][0]?.recoveryCode;

describe('accounts', () => {
  const clients: TestClient[] = [];
  afterEach(() => disconnectAll(clients));

  it('creates an account whose recovery code only its owner can see', async () => {
    clients.push(...(await connectClients(2)));
    const [owner, other] = clients;
    const name = uniqueName('Ada');
    await owner.conn.reducers.createAccount({ username: `  ${name} ` });

    await waitFor(
      () => accountOf(other.conn, owner.identity) !== undefined,
      'account visible',
    );
    const account = accountOf(other.conn, owner.identity)!;
    expect(account.username).toBe(name);
    expect(account).toMatchObject({
      roundsPlayed: 0,
      wins: 0,
      piecesPlaced: 0,
    });

    await waitFor(
      () => myCode(owner.conn) !== undefined,
      'owner sees their code',
    );
    expect(myCode(owner.conn)).toHaveLength(12);
    expect(other.conn.db.myRecoveryCode.count()).toBe(0n);
  });

  it('keeps usernames unique (ignoring case) and one account per device', async () => {
    clients.push(...(await connectClients(2)));
    const [first, second] = clients;
    const name = uniqueName('Bob');
    await first.conn.reducers.createAccount({ username: name });
    await expect(
      second.conn.reducers.createAccount({ username: name.toUpperCase() }),
    ).rejects.toThrow(/taken/);
    await expect(
      first.conn.reducers.createAccount({ username: uniqueName('Other') }),
    ).rejects.toThrow(/already has an account/);
    await expect(
      second.conn.reducers.createAccount({ username: 'a!' }),
    ).rejects.toThrow();
  });

  it('moves the account to a new device with the recovery code, which then expires', async () => {
    const original = await connectClient();
    clients.push(original);
    const name = uniqueName('Cy');
    await original.conn.reducers.createAccount({ username: name });
    await waitFor(() => myCode(original.conn) !== undefined, 'original code');
    const oldCode = myCode(original.conn)!;

    const newDevice = await connectClient();
    clients.push(newDevice);
    // Typed loosely, the way a person would.
    await newDevice.conn.reducers.recoverAccount({
      code: formatRecoveryCode(oldCode).toLowerCase(),
    });
    await waitFor(
      () => accountOf(newDevice.conn, newDevice.identity)?.username === name,
      'account now owned by the new device',
    );
    expect(accountOf(newDevice.conn, original.identity)).toBeUndefined();
    await waitFor(
      () =>
        myCode(newDevice.conn) !== undefined &&
        myCode(newDevice.conn) !== oldCode,
      'a fresh code on the new device',
    );

    const thief = await connectClient();
    clients.push(thief);
    await expect(
      thief.conn.reducers.recoverAccount({ code: oldCode }),
    ).rejects.toThrow(/Unknown/);
  });

  it('counts placed pieces in the saved stats', async () => {
    const player = await connectClient();
    clients.push(player);
    await player.conn.reducers.createAccount({ username: uniqueName('Dee') });
    await enterAll([player], await newIsland(), () => 'ignored');
    await waitFor(
      () => player.conn.db.player.identity.find(player.identity) !== null,
      'player row',
    );
    const me = player.conn.db.player.identity.find(player.identity)!;
    expect(me.name).toBe(accountOf(player.conn, player.identity)!.username);
    await player.conn.reducers.placePiece({
      kind: 'tree',
      tileX: worldToTile(me.x),
      tileZ: worldToTile(me.z),
      rotation: 0,
    });
    await waitFor(
      () => accountOf(player.conn, player.identity)?.piecesPlaced === 1,
      'piecesPlaced incremented',
    );
  });
});
