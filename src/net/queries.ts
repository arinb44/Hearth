import { tileKey, type Tile } from '../../spacetimedb/src/logic/grid';
import type { DbConnection } from '../module_bindings';
import type { Piece, Plot } from '../module_bindings/types';

interface UniqueLookup {
  find(key: number): Piece | null | undefined;
}

/**
 * The piece on a tile, from the client cache. `tile_key` is unique, and at runtime
 * the client index is a unique index with `find` (no `filter`), but the generated
 * typings declare it as a range index, so narrow it to what the runtime provides.
 */
export function pieceAt(conn: DbConnection, tile: Tile): Piece | undefined {
  const index = conn.db.piece.tileKey as unknown as UniqueLookup;
  return index.find(tileKey(tile.x, tile.z)) ?? undefined;
}

/** The local player's battle plot this round, if they have one. */
export function myPlot(conn: DbConnection, myHex: string): Plot | undefined {
  for (const plot of conn.db.plot.iter()) {
    if (plot.builder.toHexString() === myHex) return plot;
  }
  return undefined;
}

/** Mirrors the server's battle build rule for the ghost preview (see `checkTileAction`). */
export function buildRestriction(
  conn: DbConnection,
  myHex: string,
): number | null | undefined {
  const state = conn.db.gameState.id.find(0);
  if (state?.mode.tag !== 'Battle' || state.phase.tag !== 'Building')
    return undefined;
  return myPlot(conn, myHex)?.plotIndex ?? null;
}
