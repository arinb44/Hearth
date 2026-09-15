// Tile grid rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.

export const GRID_SIZE = 24;
export const TILE_SIZE = 1;

export interface Tile {
  x: number;
  z: number;
}

export function inBounds(x: number, z: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 0 &&
    z >= 0 &&
    x < GRID_SIZE &&
    z < GRID_SIZE
  );
}

/** One number per tile; the module marks it unique so a tile can hold one piece. */
export function tileKey(x: number, z: number): number {
  return x * GRID_SIZE + z;
}

export function tileFromKey(key: number): Tile {
  return { x: Math.floor(key / GRID_SIZE), z: key % GRID_SIZE };
}

/** World coordinate of a tile's center; the grid is centered on the origin. */
export function tileToWorld(index: number): number {
  return (index - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
}

export function worldToTile(coord: number): number {
  return Math.floor(coord / TILE_SIZE + GRID_SIZE / 2);
}
