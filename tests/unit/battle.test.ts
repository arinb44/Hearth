import { describe, expect, it } from 'vitest';
import { GRID_SIZE, tileToWorld } from '../../spacetimedb/src/logic/grid';
import {
  checkModify,
  checkPlacement,
} from '../../spacetimedb/src/logic/pieces';
import {
  MAX_PLOTS,
  PLOT_ASSIGNMENT_ORDER,
  PLOT_SIZE,
  plotCenter,
  plotOfTile,
  plotOrigin,
  plotWinners,
} from '../../spacetimedb/src/logic/plots';
import {
  BATTLE_THEMES,
  MAX_IDEA_LENGTH,
  optionKey,
  parseOptionKey,
  pickWinner,
  presetOptionKeys,
  sanitizeIdea,
  tallyVotes,
} from '../../spacetimedb/src/logic/themes';

describe('theme options', () => {
  it('round-trips option keys and rejects malformed ones', () => {
    expect(parseOptionKey(optionKey('idea', 17n))).toEqual({
      kind: 'idea',
      id: 17,
    });
    expect(parseOptionKey('battle:2')).toEqual({ kind: 'battle', id: 2 });
    expect(parseOptionKey('castle:1')).toBeNull();
    expect(parseOptionKey('idea:-1')).toBeNull();
    expect(parseOptionKey('idea:1; drop')).toBeNull();
  });

  it('offers every challenge and battle theme as a preset', () => {
    const keys = presetOptionKeys();
    expect(keys).toContain('challenge:0');
    expect(keys).toContain('challenge:3');
    expect(keys).toContain(`battle:${BATTLE_THEMES.length - 1}`);
    expect(keys).toHaveLength(4 + BATTLE_THEMES.length);
  });

  it('cleans up ideas and limits their length', () => {
    expect(sanitizeIdea('  Pirate\n   Cove ')).toBe('Pirate Cove');
    expect(sanitizeIdea('x'.repeat(100))).toHaveLength(MAX_IDEA_LENGTH);
    expect(sanitizeIdea(' \t ')).toBeNull();
  });
});

describe('theme tally', () => {
  const valid = ['challenge:0', 'battle:1', 'idea:5'];

  it('picks the most-voted valid option', () => {
    const tally = tallyVotes(['battle:1', 'idea:5', 'idea:5', 'challenge:0']);
    expect(pickWinner(tally, valid, () => 0)).toBe('idea:5');
  });

  it('ignores votes for options that no longer exist', () => {
    const tally = tallyVotes(['idea:9', 'idea:9', 'battle:1']);
    expect(pickWinner(tally, valid, () => 0)).toBe('battle:1');
  });

  it('breaks ties with the random source', () => {
    const tally = tallyVotes(['battle:1', 'challenge:0']);
    const first = pickWinner(tally, valid, () => 0);
    const last = pickWinner(tally, valid, () => 0.99);
    expect(new Set([first, last])).toEqual(
      new Set(['battle:1', 'challenge:0']),
    );
  });

  it('returns null when nobody voted', () => {
    expect(pickWinner(new Map(), valid, () => 0)).toBeNull();
  });
});

describe('plots', () => {
  it('splits the grid into nine 8×8 plots that cover every tile once', () => {
    expect(PLOT_SIZE * 3).toBe(GRID_SIZE);
    const counts = new Map<number, number>();
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const plot = plotOfTile({ x, z })!;
        counts.set(plot, (counts.get(plot) ?? 0) + 1);
      }
    }
    expect([...counts.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...counts.values()].every((n) => n === PLOT_SIZE * PLOT_SIZE)).toBe(
      true,
    );
    expect(plotOfTile({ x: -1, z: 0 })).toBeNull();
  });

  it('puts each plot center inside its own plot', () => {
    for (let i = 0; i < MAX_PLOTS; i++) {
      const c = plotCenter(i);
      const origin = plotOrigin(i);
      expect(c.x).toBeGreaterThan(tileToWorld(origin.x));
      expect(c.x).toBeLessThan(tileToWorld(origin.x + PLOT_SIZE - 1));
    }
    expect(plotCenter(4)).toEqual({ x: 0, z: 0 });
  });

  it('hands out every plot exactly once, center first', () => {
    expect(PLOT_ASSIGNMENT_ORDER[0]).toBe(4);
    expect([...PLOT_ASSIGNMENT_ORDER].sort()).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('finds winners, sharing ties, and none without votes', () => {
    expect(
      plotWinners(
        new Map([
          [0, 1],
          [4, 3],
          [8, 2],
        ]),
      ),
    ).toEqual([4]);
    expect(
      plotWinners(
        new Map([
          [0, 2],
          [4, 2],
          [8, 1],
        ]),
      ),
    ).toEqual([0, 4]);
    expect(
      plotWinners(
        new Map([
          [0, 0],
          [4, 0],
        ]),
      ),
    ).toEqual([]);
  });
});

describe('battle build rules', () => {
  const center = plotOrigin(4);
  const tile = { x: center.x + 3, z: center.z + 3 };
  const standing = { x: tileToWorld(tile.x), z: tileToWorld(tile.z) };
  const base = {
    kind: 'house',
    rotation: 0,
    tile,
    phase: 'Building',
    contents: {},
    playerPos: standing,
  };

  it('allows building in your own plot', () => {
    expect(checkPlacement({ ...base, plot: 4 })).toBeNull();
  });

  it('rejects building in someone else’s plot', () => {
    expect(checkPlacement({ ...base, plot: 0 })).toBe('outside_plot');
    expect(
      checkModify({ ...base, contents: { ground: 'tree' }, plot: 0 }),
    ).toBe('outside_plot');
  });

  it('rejects hosts and spectators, who have no plot', () => {
    expect(checkPlacement({ ...base, plot: null })).toBe('not_builder');
  });

  it('applies no plot rule outside battles', () => {
    expect(checkPlacement({ ...base, plot: undefined })).toBeNull();
  });
});
