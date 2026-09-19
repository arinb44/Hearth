// Build Battle plots: the 24×24 island splits into a 3×3 grid of 8×8 plots.
// Pure TypeScript: must not import spacetimedb/server.
import { GRID_SIZE, inBounds, tileToWorld, type Tile } from './grid';
import type { Vec2 } from './movement';

export const PLOTS_PER_SIDE = 3;
export const PLOT_SIZE = GRID_SIZE / PLOTS_PER_SIDE;
export const MAX_PLOTS = PLOTS_PER_SIDE * PLOTS_PER_SIDE;

/** Plots in the order they are handed out: center first, then corners, then edges. */
export const PLOT_ASSIGNMENT_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7] as const;

export function plotOfTile(tile: Tile): number | null {
  if (!inBounds(tile.x, tile.z)) return null;
  return (
    Math.floor(tile.x / PLOT_SIZE) * PLOTS_PER_SIDE +
    Math.floor(tile.z / PLOT_SIZE)
  );
}

/** The tile at the plot's minimum corner. */
export function plotOrigin(index: number): Tile {
  return {
    x: Math.floor(index / PLOTS_PER_SIDE) * PLOT_SIZE,
    z: (index % PLOTS_PER_SIDE) * PLOT_SIZE,
  };
}

/** World position of the plot's center, where its builder is placed at round start. */
export function plotCenter(index: number): Vec2 {
  const origin = plotOrigin(index);
  const mid = (start: number) =>
    (tileToWorld(start) + tileToWorld(start + PLOT_SIZE - 1)) / 2;
  return { x: mid(origin.x), z: mid(origin.z) };
}

/** Winning plots: the most votes (at least one); ties share the win. */
export function plotWinners(tally: Map<number, number>): number[] {
  const best = Math.max(0, ...tally.values());
  if (best === 0) return [];
  return [...tally]
    .filter(([, n]) => n === best)
    .map(([plot]) => plot)
    .sort((a, b) => a - b);
}
