import { tileKey, type Tile } from '../../spacetimedb/src/logic/grid';
import {
  cellKey,
  NO_ISLAND,
  SHARED_BOARD,
} from '../../spacetimedb/src/logic/islands';
import {
  GROUND,
  OVERLAY,
  type TileContents,
} from '../../spacetimedb/src/logic/pieces';
import { boardOfPlot, plotWinners } from '../../spacetimedb/src/logic/plots';
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
 * The piece on one layer of a board's tile, from the client cache. `cell_key` is
 * unique, and at runtime the client index is a unique index with `find` (no
 * `filter`), but the generated typings declare it as a range index, so narrow it to
 * what the runtime provides.
 */
export function pieceAt(
  conn: DbConnection,
  islandId: bigint,
  tile: Tile,
  layer = GROUND,
  board = SHARED_BOARD,
): Piece | undefined {
  const index = conn.db.piece.cellKey as unknown as UniqueLookup;
  const key = cellKey(islandId, tileKey(tile.x, tile.z), layer, board);
  return index.find(key) ?? undefined;
}

/** The kinds on a tile's ground and overlay layers, for the shared build rules. */
export function tileContents(
  conn: DbConnection,
  islandId: bigint,
  tile: Tile,
  board = SHARED_BOARD,
): TileContents {
  return {
    ground: pieceAt(conn, islandId, tile, GROUND, board)?.kind,
    overlay: pieceAt(conn, islandId, tile, OVERLAY, board)?.kind,
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

/** The pieces on the shared board of an island (the local player's by default). */
export function sharedBoard(
  conn: DbConnection,
  myHex: string,
  islandId = myIslandId(conn, myHex),
): Piece[] {
  return [...conn.db.piece.iter()].filter(
    (p) => p.islandId === islandId && p.board === SHARED_BOARD,
  );
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

/**
 * The board the local player builds on (mirrors the module's `buildBoard`): their
 * private board while a battle is built, null for its host and spectators, and
 * otherwise the island's shared board.
 */
export function myBuildBoard(conn: DbConnection, myHex: string): number | null {
  const state = myGameState(conn, myHex);
  if (state?.mode.tag !== 'Battle' || state.phase.tag !== 'Building') {
    return SHARED_BOARD;
  }
  const plot = myPlot(conn, myHex);
  return plot ? boardOfPlot(plot.plotIndex) : null;
}

/** True while a battle is being built: everyone works on a private board, unseen. */
export function buildingInPrivate(conn: DbConnection, myHex: string): boolean {
  const state = myGameState(conn, myHex);
  return state?.mode.tag === 'Battle' && state.phase.tag === 'Building';
}

/** The private boards of the island's current battle, in showcase order. */
export function battleBoards(conn: DbConnection, myHex: string): number[] {
  const islandId = myIslandId(conn, myHex);
  return [...conn.db.plot.iter()]
    .filter((p) => p.islandId === islandId)
    .map((p) => boardOfPlot(p.plotIndex))
    .sort((a, b) => a - b);
}

/** The battle's winning board from the live plot votes, if anyone got a vote. */
function winningBoard(conn: DbConnection, myHex: string): number | undefined {
  const islandId = myIslandId(conn, myHex);
  const tally = new Map<number, number>();
  for (const v of conn.db.plotVote.iter()) {
    if (v.islandId === islandId)
      tally.set(v.plotIndex, (tally.get(v.plotIndex) ?? 0) + 1);
  }
  const [winner] = plotWinners(tally);
  return winner === undefined ? undefined : boardOfPlot(winner);
}

/**
 * The board this client shows. In a battle: your own build while building (the empty
 * shared board for the host and spectators), the build on show in the showcase, the
 * build you are looking at while voting, and the winner's at the results. Otherwise
 * the island's shared board.
 */
export function shownBoard(
  conn: DbConnection,
  myHex: string,
  preview: number | null,
): number {
  const state = myGameState(conn, myHex);
  if (state?.mode.tag !== 'Battle') return SHARED_BOARD;
  const first = battleBoards(conn, myHex)[0] ?? SHARED_BOARD;
  switch (state.phase.tag) {
    case 'Building':
      return myBuildBoard(conn, myHex) ?? SHARED_BOARD;
    case 'Showcase':
      return state.showcaseBoard;
    case 'Voting':
      return preview ?? first;
    case 'Results':
      return winningBoard(conn, myHex) ?? first;
    default:
      return SHARED_BOARD;
  }
}
