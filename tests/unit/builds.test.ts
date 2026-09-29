import { describe, expect, it } from 'vitest';
import {
  BUILD_NAME_MAX,
  parseBuildName,
  placeablePieces,
} from '../../spacetimedb/src/logic/builds';
import { GRID_SIZE } from '../../spacetimedb/src/logic/grid';

describe('build names', () => {
  it('trims and collapses whitespace', () => {
    expect(parseBuildName('  Harbor   Town ')).toBe('Harbor Town');
  });

  it('rejects empty and overlong names', () => {
    expect(parseBuildName('   ')).toBeNull();
    expect(parseBuildName('x'.repeat(BUILD_NAME_MAX + 1))).toBeNull();
    expect(parseBuildName('x'.repeat(BUILD_NAME_MAX))).not.toBeNull();
  });
});

describe('placeable pieces', () => {
  const tree = { kind: 'tree', tileX: 3, tileZ: 4, rotation: 1 };

  it('keeps valid pieces as they are', () => {
    const rock = { kind: 'rock', tileX: 0, tileZ: GRID_SIZE - 1, rotation: 3 };
    expect(placeablePieces([tree, rock])).toEqual([tree, rock]);
  });

  it('drops unknown kinds, off-grid tiles, and bad rotations', () => {
    expect(
      placeablePieces([
        { ...tree, kind: 'spaceship' },
        { ...tree, tileX: GRID_SIZE },
        { ...tree, rotation: 4 },
        tree,
      ]),
    ).toEqual([tree]);
  });

  it('keeps only the first piece on each layer of a tile', () => {
    expect(placeablePieces([tree, { ...tree, kind: 'rock' }])).toEqual([tree]);
    const fireflies = { ...tree, kind: 'fireflies', rotation: 0 };
    expect(placeablePieces([fireflies, tree, fireflies])).toEqual([
      fireflies,
      tree,
    ]);
  });

  it('drops fireflies saved over a building', () => {
    const house = { ...tree, kind: 'house' };
    const fireflies = { ...tree, kind: 'fireflies' };
    expect(placeablePieces([fireflies, house])).toEqual([house]);
  });
});
