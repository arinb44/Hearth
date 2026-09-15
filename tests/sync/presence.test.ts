import { afterEach, describe, expect, it } from 'vitest';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '../../src/module_bindings';
import { MAX_SPEED, MOVE_BURST } from '../../spacetimedb/src/logic/movement';
import {
  connectClient,
  connectClients,
  disconnectAll,
  waitFor,
  type TestClient,
} from './helpers';

function playerOf(conn: DbConnection, identity: Identity) {
  return conn.db.player.identity.find(identity);
}

describe('presence and movement sync', () => {
  const clients: TestClient[] = [];
  afterEach(() => disconnectAll(clients));

  it('shows every joined player, with the same name and color, on every client', async () => {
    clients.push(...(await connectClients(5)));
    await Promise.all(
      clients.map((c, i) => c.conn.reducers.join({ name: `Player ${i}` })),
    );

    for (const viewer of clients) {
      await waitFor(
        () => clients.every((c) => playerOf(viewer.conn, c.identity)?.online),
        'all five players online on every client',
      );
    }
    const colors = new Set(
      clients.map((c) => playerOf(clients[0].conn, c.identity)!.colorIndex),
    );
    expect(colors.size).toBe(5);
    for (const viewer of clients) {
      clients.forEach((c, i) => {
        const row = playerOf(viewer.conn, c.identity)!;
        expect(row.name).toBe(`Player ${i}`);
        expect(row.colorIndex).toBe(
          playerOf(clients[0].conn, c.identity)!.colorIndex,
        );
      });
    }
  });

  it('converges every client on the same positions after concurrent moves', async () => {
    clients.push(...(await connectClients(5)));
    await Promise.all(
      clients.map((c) => c.conn.reducers.join({ name: 'Mover' })),
    );

    // Each player takes a short, legal step from their spawn point at the same time.
    await Promise.all(
      clients.map((c, i) => {
        const me = playerOf(c.conn, c.identity)!;
        return c.conn.reducers.move({
          x: me.x + 0.3,
          z: me.z - 0.1 * i,
          heading: i,
        });
      }),
    );

    const snapshot = () =>
      JSON.stringify(
        clients.map((c) => {
          const p = playerOf(clients[0].conn, c.identity)!;
          return [p.x, p.z, p.heading];
        }),
      );
    for (const viewer of clients.slice(1)) {
      await waitFor(
        () =>
          JSON.stringify(
            clients.map((c) => {
              const p = playerOf(viewer.conn, c.identity)!;
              return [p.x, p.z, p.heading];
            }),
          ) === snapshot(),
        'identical positions on every client',
      );
    }
    expect(playerOf(clients[1].conn, clients[3].identity)!.heading).toBeCloseTo(
      3,
    );
  });

  it('clamps a teleport on the server and every client sees the clamped position', async () => {
    clients.push(...(await connectClients(2)));
    const [mover, watcher] = clients;
    await mover.conn.reducers.join({ name: 'Teleporter' });
    const start = playerOf(mover.conn, mover.identity)!;

    await mover.conn.reducers.move({ x: start.x + 50, z: start.z, heading: 0 });

    await waitFor(() => {
      const row = playerOf(watcher.conn, mover.identity);
      return row !== undefined && row.x !== start.x;
    }, 'watcher sees the move');
    const seen = playerOf(watcher.conn, mover.identity)!;
    const moved = Math.hypot(seen.x - start.x, seen.z - start.z);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(MAX_SPEED * MOVE_BURST + 0.01);
  });

  it('rejects movement from a client that has not joined', async () => {
    clients.push(await connectClient());
    await expect(
      clients[0].conn.reducers.move({ x: 1, z: 1, heading: 0 }),
    ).rejects.toThrow();
  });

  it('stays online while a second tab is open, and goes offline when the last one closes', async () => {
    const first = await connectClient();
    const watcher = await connectClient();
    clients.push(first, watcher);
    await first.conn.reducers.join({ name: 'Two Tabs' });
    const second = await connectClient(first.token);
    expect(second.identity.isEqual(first.identity)).toBe(true);

    first.conn.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    expect(playerOf(watcher.conn, first.identity)?.online).toBe(true);

    second.conn.disconnect();
    await waitFor(
      () => playerOf(watcher.conn, first.identity)?.online === false,
      'player offline after last tab closes',
    );
  });

  it('keeps identity, name, and online state across a reconnect', async () => {
    const original = await connectClient();
    const watcher = await connectClient();
    clients.push(watcher);
    await original.conn.reducers.join({ name: 'Comeback' });
    original.conn.disconnect();
    await waitFor(
      () => playerOf(watcher.conn, original.identity)?.online === false,
      'offline after disconnect',
    );

    const again = await connectClient(original.token);
    clients.push(again);
    expect(again.identity.isEqual(original.identity)).toBe(true);
    await waitFor(
      () => playerOf(watcher.conn, original.identity)?.online === true,
      'online again after reconnect',
    );
    expect(playerOf(again.conn, original.identity)!.name).toBe('Comeback');
  });
});
