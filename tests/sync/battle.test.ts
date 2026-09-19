import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '../../src/module_bindings';
import { worldToTile } from '../../spacetimedb/src/logic/grid';
import { plotOrigin } from '../../spacetimedb/src/logic/plots';
import { optionKey } from '../../spacetimedb/src/logic/themes';
import {
  adminCall,
  connectClients,
  disconnectAll,
  waitFor,
  type TestClient,
} from './helpers';

const state = (conn: DbConnection) => conn.db.gameState.id.find(0)!;
const plotOf = (conn: DbConnection, who: Identity) =>
  conn.db.plot.builder.find(who)?.plotIndex;

async function joinAll(clients: TestClient[], names: string[]): Promise<void> {
  await Promise.all(
    clients.map((c, i) => c.conn.reducers.join({ name: names[i] })),
  );
}

/** Submits an idea from `author`, has everyone vote for it, and starts the round. */
async function startIdeaBattle(
  clients: TestClient[],
  author: TestClient,
  text: string,
) {
  await author.conn.reducers.submitIdea({ text });
  await waitFor(
    () => [...author.conn.db.idea.iter()].some((i) => i.text === text),
    'idea row',
  );
  const idea = [...author.conn.db.idea.iter()].find((i) => i.text === text)!;
  await Promise.all(
    clients.map((c) =>
      c.conn.reducers.voteTheme({ option: optionKey('idea', idea.id) }),
    ),
  );
  await author.conn.reducers.startRound({});
  for (const c of clients) {
    await waitFor(
      () => state(c.conn).phase.tag === 'Building',
      'battle building',
    );
  }
}

describe('theme vote and build battle', () => {
  const clients: TestClient[] = [];
  beforeEach(() => adminCall('reset_game'));
  afterEach(() => {
    disconnectAll(clients);
    adminCall('reset_game');
  });

  it('shows ideas and votes live, and starts the most-voted option', async () => {
    clients.push(...(await connectClients(3)));
    const [ada, bob, cy] = clients;
    await joinAll(clients, ['Ada', 'Bob', 'Cy']);

    await ada.conn.reducers.submitIdea({ text: '  Pirate   Cove ' });
    for (const c of clients) {
      await waitFor(
        () => [...c.conn.db.idea.iter()].some((i) => i.text === 'Pirate Cove'),
        'idea visible to everyone',
      );
    }
    const idea = [...bob.conn.db.idea.iter()][0];
    expect(idea.authorName).toBe('Ada');

    await expect(
      bob.conn.reducers.voteTheme({ option: 'battle:99' }),
    ).rejects.toThrow();
    await ada.conn.reducers.voteTheme({ option: optionKey('idea', idea.id) });
    await bob.conn.reducers.voteTheme({ option: 'challenge:2' });
    await bob.conn.reducers.voteTheme({ option: optionKey('idea', idea.id) }); // changed vote
    await cy.conn.reducers.voteTheme({ option: 'battle:0' });
    for (const c of clients) {
      await waitFor(
        () => c.conn.db.themeVote.count() === 3n,
        'three votes everywhere',
      );
    }

    await bob.conn.reducers.startRound({});
    for (const c of clients) {
      await waitFor(
        () => state(c.conn).phase.tag === 'Building',
        'round started',
      );
    }
    const s = state(cy.conn);
    expect(s.mode.tag).toBe('Battle');
    expect(s.themeTitle).toBe('Pirate Cove');
    expect(s.host?.isEqual(ada.identity)).toBe(true);
    await waitFor(
      () =>
        cy.conn.db.idea.count() === 0n && cy.conn.db.themeVote.count() === 0n,
      'idea consumed and votes cleared',
    );
    expect(plotOf(cy.conn, ada.identity)).toBeUndefined(); // the host does not build
    expect(plotOf(cy.conn, bob.identity)).toBeDefined();
    expect(plotOf(cy.conn, cy.identity)).toBeDefined();
    await expect(
      cy.conn.reducers.voteTheme({ option: 'battle:0' }),
    ).rejects.toThrow();
  });

  it('runs a battle: plot-only building, voting, and a tallied winner', async () => {
    clients.push(...(await connectClients(4)));
    const [host, b1, b2, b3] = clients;
    await joinAll(clients, [
      'Host',
      'Builder One',
      'Builder Two',
      'Builder Three',
    ]);
    await startIdeaBattle(clients, host, 'Dragon Lair');

    const plots = [b1, b2, b3].map((b) => plotOf(host.conn, b.identity)!);
    expect(new Set(plots).size).toBe(3);

    // Builders are moved to their plot, so the tile under them is in reach and theirs.
    const me = b1.conn.db.player.identity.find(b1.identity)!;
    const ownTile = { x: worldToTile(me.x), z: worldToTile(me.z) };
    await b1.conn.reducers.placePiece({
      kind: 'tower',
      tileX: ownTile.x,
      tileZ: ownTile.z,
      rotation: 0,
    });

    const elsewhere = plotOrigin(plots[1]);
    await expect(
      b1.conn.reducers.placePiece({
        kind: 'rock',
        tileX: elsewhere.x,
        tileZ: elsewhere.z,
        rotation: 0,
      }),
    ).rejects.toThrow(/own plot/);
    const hostPos = host.conn.db.player.identity.find(host.identity)!;
    await expect(
      host.conn.reducers.placePiece({
        kind: 'rock',
        tileX: worldToTile(hostPos.x),
        tileZ: worldToTile(hostPos.z),
        rotation: 0,
      }),
    ).rejects.toThrow(/not building/);

    adminCall('skip_phase');
    for (const c of clients) {
      await waitFor(() => state(c.conn).phase.tag === 'Voting', 'voting phase');
    }
    await expect(
      b1.conn.reducers.votePlot({ plotIndex: plots[0] }),
    ).rejects.toThrow();
    await host.conn.reducers.votePlot({ plotIndex: plots[0] });
    await b2.conn.reducers.votePlot({ plotIndex: plots[0] });
    await b3.conn.reducers.votePlot({ plotIndex: plots[1] });
    await b3.conn.reducers.votePlot({ plotIndex: plots[0] }); // changed vote
    await b1.conn.reducers.votePlot({ plotIndex: plots[1] });

    const round = state(host.conn).round;
    adminCall('skip_phase');
    for (const c of clients) {
      await waitFor(
        () => c.conn.db.roundResult.round.find(round) !== null,
        'battle result',
      );
    }
    const result = b2.conn.db.roundResult.round.find(round)!;
    expect(result.mode.tag).toBe('Battle');
    expect(result.themeTitle).toBe('Dragon Lair');
    expect(result.score).toBe(3);
    expect(result.contributions[0]).toMatchObject({
      name: 'Builder One',
      votes: 3,
      pieces: 1,
    });
    expect(result.contributions.map((c) => c.name)).not.toContain('Host');
    expect(state(b2.conn).phase.tag).toBe('Results');
  });
});
