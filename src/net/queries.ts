import { tileKey, type Tile } from '../../spacetimedb/src/logic/grid';
import { cellKey, NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import {
  GROUND,
  OVERLAY,
  type TileContents,
} from '../../spacetimedb/src/logic/pieces';
import type { DbConnection } from '../module_bindings';
import type {
  GameState,
  Piece,
  Plot,
  RoundResult,
} from '../module_bindings/types';

interface UniqueLookup {
  find(key: bigint): Piece | null | undefined;
}

/** The island the local player is on; their own player row is always subscribed. */
export function myIslandId(conn: DbConnection, myHex: string): bigint {
  for (const p of conn.db.player.iter()) {
    if (p.identity.toHexString() === myHex) return p.islandId;
  }
  return NO_ISLAND;
}

/** Round state of the local player's island, if they are on one. */
export function myGameState(
  conn: DbConnection,
  myHex: string,
): GameState | undefined {
  const islandId = myIslandId(conn, myHex);
  if (islandId === NO_ISLAND) return undefined;
  return conn.db.gameState.islandId.find(islandId) ?? undefined;
}

/**
 * The piece on one layer of an island's tile, from the client cache. `cell_key` is
 * unique, and at runtime the client index is a unique index with `find` (no
 * `filter`), but the generated typings declare it as a range index, so narrow it to
 * what the runtime provides.
 */
export function pieceAt(
  conn: DbConnection,
  islandId: bigint,
  tile: Tile,
  layer = GROUND,
): Piece | undefined {
  const index = conn.db.piece.cellKey as unknown as UniqueLookup;
  return (
    index.find(cellKey(islandId, tileKey(tile.x, tile.z), layer)) ?? undefined
  );
}

/** The kinds on a tile's ground and overlay layers, for the shared build rules. */
export function tileContents(
  conn: DbConnection,
  islandId: bigint,
  tile: Tile,
): TileContents {
  return {
    ground: pieceAt(conn, islandId, tile, GROUND)?.kind,
    overlay: pieceAt(conn, islandId, tile, OVERLAY)?.kind,
  };
}

/** The result row for an island's round, once it has been recorded. */
export function resultFor(
  conn: DbConnection,
  islandId: bigint,
  round: number,
): RoundResult | undefined {
  for (const r of conn.db.roundResult.iter()) {
    if (r.islandId === islandId && r.round === round) return r;
  }
  return undefined;
}

/** The local player's battle plot this round, if they have one. */
export function myPlot(conn: DbConnection, myHex: string): Plot | undefined {
  const islandId = myIslandId(conn, myHex);
  for (const plot of conn.db.plot.iter()) {
    if (plot.islandId === islandId && plot.builder.toHexString() === myHex) {
      return plot;
    }
  }
  return undefined;
}

/** Mirrors the server's battle build rule for the ghost preview (see `checkTileAction`). */
export function buildRestriction(
  conn: DbConnection,
  myHex: string,
): number | null | undefined {
  const state = myGameState(conn, myHex);
  if (state?.mode.tag !== 'Battle' || state.phase.tag !== 'Building')
    return undefined;
  return myPlot(conn, myHex)?.plotIndex ?? null;
}
