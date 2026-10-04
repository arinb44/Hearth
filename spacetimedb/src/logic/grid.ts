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

/**
 * The tiles a drag passes from `from` (excluded) to `to` (included), one side step at a
 * time, so a fast sweep leaves no gaps and a dragged path or wall stays connected.
 */
export function tileLine(from: Tile, to: Tile): Tile[] {
  const nx = Math.abs(to.x - from.x);
  const nz = Math.abs(to.z - from.z);
  const sx = Math.sign(to.x - from.x);
  const sz = Math.sign(to.z - from.z);
  const out: Tile[] = [];
  let { x, z } = from;
  for (let ix = 0, iz = 0; ix < nx || iz < nz;) {
    // Step along whichever axis is further behind its share of the line.
    if ((0.5 + ix) / nx < (0.5 + iz) / nz) {
      x += sx;
      ix++;
    } else {
      z += sz;
      iz++;
    }
    out.push({ x, z });
  }
  return out;
}
