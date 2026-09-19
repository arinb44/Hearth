// Piece catalog and building rules shared by the module (enforcement), the client
// (ghost preview), and the tests. Pure TypeScript: must not import spacetimedb/server.
import { inBounds, tileToWorld, type Tile } from './grid';
import { plotOfTile } from './plots';
import type { Vec2 } from './movement';

export const PIECE_KINDS = [
  'house',
  'tree',
  'pine',
  'rock',
  'path',
  'flowers',
  'fence',
  'well',
  'lamp',
  'tower',
] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export const PIECE_LABELS: Record<PieceKind, string> = {
  house: 'House',
  tree: 'Tree',
  pine: 'Pine',
  rock: 'Rock',
  path: 'Path',
  flowers: 'Flowers',
  fence: 'Fence',
  well: 'Well',
  lamp: 'Lamp',
  tower: 'Tower',
};

/** How far (world units) from your avatar you can build. */
export const BUILD_REACH = 4.5;
/** Extra reach the server allows, since it sees positions up to ~100 ms late. */
export const SERVER_REACH_SLACK = 1;

export type BuildError =
  | 'out_of_bounds'
  | 'unknown_kind'
  | 'bad_rotation'
  | 'occupied'
  | 'empty'
  | 'out_of_reach'
  | 'wrong_phase'
  | 'outside_plot'
  | 'not_builder';

export const BUILD_ERROR_MESSAGES: Record<BuildError, string> = {
  out_of_bounds: 'That tile is off the island',
  unknown_kind: 'Unknown piece',
  bad_rotation: 'Invalid rotation',
  occupied: 'That tile is already taken',
  empty: 'Nothing to change on that tile',
  out_of_reach: 'Walk closer to build there',
  wrong_phase: 'Building is paused right now',
  outside_plot: 'Build inside your own plot',
  not_builder: 'You are not building this round. Watch and vote!',
};

export function isPieceKind(kind: string): kind is PieceKind {
  return (PIECE_KINDS as readonly string[]).includes(kind);
}

export function canBuildInPhase(phase: string): boolean {
  return phase === 'Lobby' || phase === 'Building';
}

export function withinReach(pos: Vec2, tile: Tile, slack = 0): boolean {
  const dx = tileToWorld(tile.x) - pos.x;
  const dz = tileToWorld(tile.z) - pos.z;
  return Math.hypot(dx, dz) <= BUILD_REACH + slack;
}

interface TileAction {
  tile: Tile;
  phase: string;
  /** Whether a piece already stands on the tile. */
  occupied: boolean;
  playerPos: Vec2;
  reachSlack?: number;
  /**
   * Build Battle restriction: the player's plot, or null if they have none (host or
   * spectator). Undefined means no restriction (co-op and lobby).
   */
  plot?: number | null;
}

function checkTileAction(action: TileAction): BuildError | null {
  if (!inBounds(action.tile.x, action.tile.z)) return 'out_of_bounds';
  if (!canBuildInPhase(action.phase)) return 'wrong_phase';
  if (action.plot === null) return 'not_builder';
  if (action.plot !== undefined && plotOfTile(action.tile) !== action.plot) {
    return 'outside_plot';
  }
  if (!withinReach(action.playerPos, action.tile, action.reachSlack)) {
    return 'out_of_reach';
  }
  return null;
}

export function checkPlacement(
  action: TileAction & { kind: string; rotation: number },
): BuildError | null {
  if (!isPieceKind(action.kind)) return 'unknown_kind';
  if (
    !Number.isInteger(action.rotation) ||
    action.rotation < 0 ||
    action.rotation > 3
  ) {
    return 'bad_rotation';
  }
  return checkTileAction(action) ?? (action.occupied ? 'occupied' : null);
}

/** Rules for rotating or removing an existing piece. */
export function checkModify(action: TileAction): BuildError | null {
  return checkTileAction(action) ?? (action.occupied ? null : 'empty');
}
