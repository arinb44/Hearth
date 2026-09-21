// Island rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.
import { GRID_SIZE } from './grid';
import { MAX_PLOTS } from './plots';

/** `player.island_id` when a player is on the main screen, not on any island. */
export const NO_ISLAND = 0n;

/** `island.owner_account_id` of the shared main island, which nobody owns. */
export const NO_OWNER = 0n;
export const MAIN_ISLAND_NAME = 'Main Island';

export const ISLAND_NAME_MIN = 3;
export const ISLAND_NAME_MAX = 24;
/** Online players per island: one per color and enough for a full battle. */
export const MAX_ISLAND_PLAYERS = 10;
export const MAX_ISLANDS_PER_ACCOUNT = 3;

/**
 * Only the main island starts rounds on its own after the lobby countdown. Player
 * islands stay in the lobby (free building, or a loaded build) until someone presses Start.
 */
export function autoStartsRounds(ownerAccountId: bigint): boolean {
  return ownerAccountId === NO_OWNER;
}

/** Suggested name for a new island; long usernames get the shorter "Isle". */
export function defaultIslandName(username: string): string {
  const island = username + "'s Island";
  return island.length <= ISLAND_NAME_MAX
    ? island
    : (username + "'s Isle").slice(0, ISLAND_NAME_MAX);
}

/**
 * One number per (island, tile). The module marks it unique, so the database itself
 * still guarantees one piece per tile on every island.
 */
export function cellKey(islandId: bigint, tileKey: number): bigint {
  return islandId * 1000n + BigInt(tileKey);
}

/** One number per (island, plot); unique, so each plot has one builder per island. */
export function plotKey(islandId: bigint, plotIndex: number): bigint {
  return islandId * 10n + BigInt(plotIndex);
}

/** Trims and collapses whitespace; null if too short or too long. */
export function parseIslandName(raw: string): string | null {
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name.length >= ISLAND_NAME_MIN && name.length <= ISLAND_NAME_MAX
    ? name
    : null;
}

// The key packing above relies on these bounds.
if (GRID_SIZE * GRID_SIZE > 1000 || MAX_PLOTS > 10) {
  throw new Error(
    'cellKey/plotKey packing no longer fits the grid or plot count',
  );
}
