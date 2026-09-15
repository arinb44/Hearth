import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  inBounds,
  tileFromKey,
  tileKey,
  tileToWorld,
  worldToTile,
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
