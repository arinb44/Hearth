// Piece catalog and building rules shared by the module (enforcement), the client
// (ghost preview), and the tests. Pure TypeScript: must not import spacetimedb/server.
import { inBounds, tileToWorld, type Tile } from './grid';
import type { Vec2 } from './movement';

// The first ten keep their 1–0 hotkeys; newer kinds are appended after them.
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
  'water',
  'tile',
  'bridge',
  'grass',
  'fireflies',
  'bench',
  'wall',
  'campfire',
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
  water: 'Water',
  tile: 'Stone Tile',
  bridge: 'Bridge',
  grass: 'Grass',
  fireflies: 'Fireflies',
  bench: 'Bench',
  wall: 'Stone Wall',
  campfire: 'Campfire',
};

/** Buildings fill their tile: nothing stacks on them. */
const BUILDINGS: PieceKind[] = ['house', 'tower', 'wall', 'well', 'bridge'];

/** Palette groups, in display order; every kind appears in exactly one. */
export const PIECE_CATEGORIES: { name: string; kinds: PieceKind[] }[] = [
  { name: 'Buildings', kinds: BUILDINGS },
  { name: 'Greenery', kinds: ['tree', 'pine', 'flowers', 'grass'] },
  { name: 'Furniture', kinds: ['fence', 'lamp', 'bench'] },
  {
    name: 'Environment',
    kinds: ['path', 'tile', 'water', 'rock', 'fireflies', 'campfire'],
  },
];

/** Layers of a tile: one ground piece, and fireflies floating above it. */
export const GROUND = 0;
export const OVERLAY = 1;

export function layerOf(kind: string): number {
  return kind === 'fireflies' ? OVERLAY : GROUND;
}

export function isBuilding(kind: string): boolean {
  return (BUILDINGS as string[]).includes(kind);
}

/** What stands on a tile: the ground piece's kind and the overlay's, if any. */
export interface TileContents {
  ground?: string;
  overlay?: string;
}

/** How far (world units) from your avatar you can build. */
export const BUILD_REACH = 4.5;
/** Extra reach the server allows, since it sees positions up to ~100 ms late. */
export const SERVER_REACH_SLACK = 1;

export type BuildError =
  | 'out_of_bounds'
  | 'unknown_kind'
  | 'bad_rotation'
  | 'occupied'
  | 'cannot_stack'
  | 'empty'
  | 'out_of_reach'
  | 'wrong_phase'
  | 'not_builder';

export const BUILD_ERROR_MESSAGES: Record<BuildError, string> = {
  out_of_bounds: 'That tile is off the island',
  unknown_kind: 'Unknown piece',
  bad_rotation: 'Invalid rotation',
  occupied: 'That tile is already taken',
  cannot_stack: 'Fireflies can’t share a tile with a building',
  empty: 'Nothing to change on that tile',
  out_of_reach: 'Walk closer to build there',
  wrong_phase: 'Building is paused right now',
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
  contents: TileContents;
  playerPos: Vec2;
  reachSlack?: number;
  /** True for a battle's host and spectators, who watch the builders instead. */
  watching?: boolean;
}

function checkTileAction(action: TileAction): BuildError | null {
  if (!inBounds(action.tile.x, action.tile.z)) return 'out_of_bounds';
  if (!canBuildInPhase(action.phase)) return 'wrong_phase';
  if (action.watching) return 'not_builder';
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
  return checkTileAction(action) ?? stackError(action.kind, action.contents);
}

/** Each layer holds one piece, and fireflies never share a tile with a building. */
function stackError(kind: string, tile: TileContents): BuildError | null {
  if (layerOf(kind) === OVERLAY) {
    if (tile.overlay) return 'occupied';
    return tile.ground && isBuilding(tile.ground) ? 'cannot_stack' : null;
  }
  if (tile.ground) return 'occupied';
  return tile.overlay && isBuilding(kind) ? 'cannot_stack' : null;
}

/** Rules for rotating or removing an existing piece. */
export function checkModify(action: TileAction): BuildError | null {
  const { ground, overlay } = action.contents;
  return checkTileAction(action) ?? (ground || overlay ? null : 'empty');
}

/** Rotating turns the ground piece; removing takes the top piece first. */
export function modifyTarget(
  tile: TileContents,
  action: 'rotate' | 'remove',
): number | null {
  const order = action === 'rotate' ? [GROUND, OVERLAY] : [OVERLAY, GROUND];
  return (
    order.find((layer) => (layer === GROUND ? tile.ground : tile.overlay)) ??
    null
  );
}
