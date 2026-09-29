import { describe, expect, it } from 'vitest';
import { GRID_SIZE, tileKey } from '../../spacetimedb/src/logic/grid';
import {
  autoStartsRounds,
  cellKey,
  defaultIslandName,
  ISLAND_NAME_MAX,
  NO_OWNER,
  parseIslandName,
  plotKey,
} from '../../spacetimedb/src/logic/islands';
import { MAX_PLOTS } from '../../spacetimedb/src/logic/plots';

describe('island keys', () => {
  it('gives every (island, board, layer, tile) its own cell key', () => {
    const seen = new Set<bigint>();
    const boards = MAX_PLOTS + 1;
    for (const island of [1n, 2n, 999n]) {
      for (let board = 0; board < boards; board++) {
        for (const layer of [0, 1]) {
          for (let x = 0; x < GRID_SIZE; x++) {
            for (let z = 0; z < GRID_SIZE; z++) {
              seen.add(cellKey(island, tileKey(x, z), layer, board));
            }
          }
        }
      }
    }
    expect(seen.size).toBe(3 * boards * 2 * GRID_SIZE * GRID_SIZE);
  });

  it('gives every (island, plot) pair its own plot key', () => {
    const keys = [1n, 2n, 10n].flatMap((island) =>
      Array.from({ length: MAX_PLOTS }, (_, i) => plotKey(island, i)),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('island names', () => {
  it('trims and collapses whitespace', () => {
    expect(parseIslandName('  Coral   Reef ')).toBe('Coral Reef');
  });

  it('rejects names that are too short or too long', () => {
    expect(parseIslandName('ab')).toBeNull();
    expect(parseIslandName('   ')).toBeNull();
    expect(parseIslandName('x'.repeat(ISLAND_NAME_MAX + 1))).toBeNull();
    expect(parseIslandName('x'.repeat(ISLAND_NAME_MAX))).not.toBeNull();
  });

  it('suggests a default name that always fits', () => {
    expect(defaultIslandName('Ada')).toBe("Ada's Island");
    const long = defaultIslandName('Sixteen Chars Ab');
    expect(long.length).toBeLessThanOrEqual(ISLAND_NAME_MAX);
    expect(parseIslandName(long)).toBe(long);
  });
});

describe('round auto-start', () => {
  it('runs on the main island only', () => {
    expect(autoStartsRounds(NO_OWNER)).toBe(true);
    expect(autoStartsRounds(1n)).toBe(false);
    expect(autoStartsRounds(42n)).toBe(false);
  });
});
