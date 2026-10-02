import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '../../src/module_bindings';
import { resultFor } from '../../src/net/queries';
import { boardOfPlot } from '../../spacetimedb/src/logic/plots';
import { optionKey } from '../../spacetimedb/src/logic/themes';
import {
  adminCall,
  connectClients,
  connectWithAccount,
  disconnectAll,
  enterAll,
  newIsland,
  waitFor,
  watchIsland,
  type TestClient,
} from './helpers';

let island = 0n;
const state = (conn: DbConnection) => conn.db.gameState.islandId.find(island)!;
const plotOf = (conn: DbConnection, who: Identity) =>
  [...conn.db.plot.iter()].find(
    (p) => p.islandId === island && p.builder.isEqual(who),
  )?.plotIndex;
const ideasHere = (conn: DbConnection) =>
  [...conn.db.idea.iter()].filter((i) => i.islandId === island);
const votesHere = (conn: DbConnection) =>
  [...conn.db.themeVote.iter()].filter((v) => v.islandId === island);

async function joinAll(clients: TestClient[], names: string[]): Promise<void> {
  await enterAll(clients, island, (i) => names[i]);
}

/** Submits an idea from `author`, has everyone vote for it, and starts the round. */
async function startIdeaBattle(
  clients: TestClient[],
  author: TestClient,
  text: string,
) {
  await author.conn.reducers.submitIdea({ text });
  await waitFor(
    () => ideasHere(author.conn).some((i) => i.text === text),
    'idea row',
  );
  const idea = ideasHere(author.conn).find((i) => i.text === text)!;
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
  beforeEach(async () => {
    island = await newIsland();
  });
  afterEach(() => disconnectAll(clients));

  it('shows ideas and votes live, and starts the most-voted option', async () => {
    clients.push(...(await connectClients(3)));
    const [ada, bob, cy] = clients;
    await joinAll(clients, ['Ada', 'Bob', 'Cy']);

    await ada.conn.reducers.submitIdea({ text: '  Pirate   Cove ' });
    for (const c of clients) {
      await waitFor(
        () => ideasHere(c.conn).some((i) => i.text === 'Pirate Cove'),
        'idea visible to everyone',
      );
    }
    const idea = ideasHere(bob.conn)[0];
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
        () => votesHere(c.conn).length === 3,
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
      () => ideasHere(cy.conn).length === 0 && votesHere(cy.conn).length === 0,
      'idea consumed and votes cleared',
    );
    expect(plotOf(cy.conn, ada.identity)).toBeUndefined(); // the host does not build
    expect(plotOf(cy.conn, bob.identity)).toBeDefined();
    expect(plotOf(cy.conn, cy.identity)).toBeDefined();
    await expect(
      cy.conn.reducers.voteTheme({ option: 'battle:0' }),
    ).rejects.toThrow();
  });

  it('runs a battle: private boards, a synced showcase, voting, and a winner', async () => {
    clients.push(...(await connectClients(3)));
    const [host, b2, b3] = clients;
    const b1 = await connectWithAccount('Bone');
    clients.push(b1);
    const everyone = [host, b1, b2, b3];
    await enterAll(everyone, island, (i) => ['Host', '', 'Two', 'Three'][i]);
    await startIdeaBattle(everyone, host, 'Dragon Lair');

    const boardOf = (c: TestClient) =>
      boardOfPlot(plotOf(host.conn, c.identity)!);
    const boards = [b1, b2, b3].map(boardOf);
    expect(new Set(boards).size).toBe(3);

    // Each builder has a private full board: the same tile holds a piece on each.
    const center = { tileX: 12, tileZ: 12, rotation: 0 };
    await b1.conn.reducers.placePiece({ kind: 'tower', ...center });
    await b2.conn.reducers.placePiece({ kind: 'rock', ...center });
    await expect(
      host.conn.reducers.placePiece({ kind: 'rock', ...center }),
    ).rejects.toThrow(/not building/);

    // Subscribed the way the browser is while building: only one board arrives.
    const watcher = await watchIsland(island);
    watcher.sub.showBoard(boardOf(b2));
    const boardsSeen = () =>
      new Set(
        [...watcher.conn.db.piece.iter()]
          .filter((p) => p.islandId === island)
          .map((p) => p.board),
      );
    try {
      await waitFor(() => boardsSeen().has(boardOf(b2)), "Two's rock");
      expect(boardsSeen()).toEqual(new Set([boardOf(b2)]));

      // Saving during a battle keeps your own build.
      await b1.conn.reducers.saveBuild({ name: 'Lair' });
      await waitFor(() => b1.conn.db.savedBuild.count() === 1n, 'saved');
      expect([...b1.conn.db.savedBuild.iter()][0].pieces).toEqual([
        { kind: 'tower', tileX: 12, tileZ: 12, rotation: 0 },
      ]);

      // The showcase walks every client through the builds, in board order.
      const sorted = [...boards].sort((a, b) => a - b);
      for (const board of sorted) {
        adminCall('skip_phase', String(island));
        for (const c of everyone) {
          await waitFor(
            () =>
              state(c.conn).phase.tag === 'Showcase' &&
              state(c.conn).showcaseBoard === board,
            `showing board ${board}`,
          );
        }
        const ends = everyone.map(
          (c) => state(c.conn).phaseEndsAt!.microsSinceUnixEpoch,
        );
        expect(new Set(ends).size).toBe(1);
      }
      watcher.sub.showBoard(null);
      await waitFor(
        () => boardsSeen().has(boardOf(b1)),
        'every build arrives after the private phase',
      );
    } finally {
      watcher.conn.disconnect();
    }

    adminCall('skip_phase', String(island));
    for (const c of everyone) {
      await waitFor(() => state(c.conn).phase.tag === 'Voting', 'voting phase');
    }
    expect(state(host.conn).showcaseBoard).toBe(0);
    const plots = [b1, b2].map((b) => plotOf(host.conn, b.identity)!);
    await expect(
      b1.conn.reducers.votePlot({ plotIndex: plots[0] }),
    ).rejects.toThrow();
    await host.conn.reducers.votePlot({ plotIndex: plots[0] });
    await b2.conn.reducers.votePlot({ plotIndex: plots[0] });
    await b3.conn.reducers.votePlot({ plotIndex: plots[1] });
    await b3.conn.reducers.votePlot({ plotIndex: plots[0] }); // changed vote
    await b1.conn.reducers.votePlot({ plotIndex: plots[1] });

    const round = state(host.conn).round;
    adminCall('skip_phase', String(island));
    for (const c of everyone) {
      await waitFor(
        () => resultFor(c.conn, island, round) !== undefined,
        'battle result',
      );
    }
    const result = resultFor(b2.conn, island, round)!;
    expect(result.mode.tag).toBe('Battle');
    expect(result.themeTitle).toBe('Dragon Lair');
    expect(result.score).toBe(3);
    expect(result.contributions[0]).toMatchObject({
      name: b1.username,
      votes: 3,
      pieces: 1,
    });
    expect(result.contributions.find((c) => c.name === 'Two')?.pieces).toBe(1);
    expect(result.contributions.map((c) => c.name)).not.toContain('Host');
    expect(state(b2.conn).phase.tag).toBe('Results');
  });
});
