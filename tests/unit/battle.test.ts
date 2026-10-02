import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../../spacetimedb/src/logic/grid';
import {
  checkModify,
  checkPlacement,
} from '../../spacetimedb/src/logic/pieces';
import {
  boardOfPlot,
  MAX_PLOTS,
  nextShowcase,
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

describe('battle boards', () => {
  it('gives every builder a private board after the shared board 0', () => {
    const boards = Array.from({ length: MAX_PLOTS }, (_, i) => boardOfPlot(i));
    expect(boards[0]).toBe(1);
    expect(new Set(boards).size).toBe(MAX_PLOTS);
    expect(boards).not.toContain(0);
  });

  it('tours the builds in board order, then stops', () => {
    const boards = [3, 1, 2];
    expect(nextShowcase(boards, 0)).toBe(1);
    expect(nextShowcase(boards, 1)).toBe(2);
    expect(nextShowcase(boards, 2)).toBe(3);
    expect(nextShowcase(boards, 3)).toBeNull();
    expect(nextShowcase([], 0)).toBeNull();
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
  const tile = { x: 12, z: 12 };
  const standing = { x: tileToWorld(tile.x), z: tileToWorld(tile.z) };
  const base = {
    kind: 'house',
    rotation: 0,
    tile,
    phase: 'Building',
    contents: {},
    playerPos: standing,
  };

  it('lets builders build anywhere on their own board', () => {
    expect(checkPlacement(base)).toBeNull();
    expect(checkPlacement({ ...base, watching: false })).toBeNull();
  });

  it('rejects hosts and spectators, who watch instead', () => {
    expect(checkPlacement({ ...base, watching: true })).toBe('not_builder');
    expect(
      checkModify({ ...base, contents: { ground: 'tree' }, watching: true }),
    ).toBe('not_builder');
  });
});
