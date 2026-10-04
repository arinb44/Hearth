import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  inBounds,
  tileFromKey,
  tileKey,
  tileLine,
  tileToWorld,
  worldToTile,
  type Tile,
} from '../../spacetimedb/src/logic/grid';

describe('grid', () => {
  it('accepts tiles inside the grid', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(GRID_SIZE - 1, GRID_SIZE - 1)).toBe(true);
  });

  it('rejects tiles outside the grid or with fractional coordinates', () => {
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, GRID_SIZE)).toBe(false);
    expect(inBounds(1.5, 2)).toBe(false);
    expect(inBounds(Number.NaN, 0)).toBe(false);
  });

  it('gives every tile a distinct key that round-trips', () => {
    const seen = new Set<number>();
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const key = tileKey(x, z);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        expect(tileFromKey(key)).toEqual({ x, z });
      }
    }
  });

  it('maps tile centers to world space and back', () => {
    for (let i = 0; i < GRID_SIZE; i++) {
      expect(worldToTile(tileToWorld(i))).toBe(i);
    }
    expect(tileToWorld(0) + tileToWorld(GRID_SIZE - 1)).toBeCloseTo(0);
  });
});

describe('tileLine', () => {
  const t = (x: number, z: number): Tile => ({ x, z });

  it('is empty when the drag stays on one tile', () => {
    expect(tileLine(t(3, 3), t(3, 3))).toEqual([]);
  });

  it('walks straight lines in every direction, ending on the target', () => {
    expect(tileLine(t(2, 5), t(5, 5))).toEqual([t(3, 5), t(4, 5), t(5, 5)]);
    expect(tileLine(t(5, 5), t(5, 2))).toEqual([t(5, 4), t(5, 3), t(5, 2)]);
  });

  it('fills every tile on a fast diagonal sweep, one side step at a time', () => {
    for (const to of [t(9, 6), t(0, 0), t(4, 11), t(10, 1)]) {
      const from = t(4, 4);
      const line = tileLine(from, to);
      expect(line).toHaveLength(
        Math.abs(to.x - from.x) + Math.abs(to.z - from.z),
      );
      expect(line.at(-1)).toEqual(to);
      let prev = from;
      for (const tile of line) {
        expect(Math.abs(tile.x - prev.x) + Math.abs(tile.z - prev.z)).toBe(1);
        prev = tile;
      }
    }
  });
});
