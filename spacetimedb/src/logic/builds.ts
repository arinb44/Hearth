// Saved build rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.
import { inBounds, tileKey } from './grid';
import { isBuilding, isPieceKind, layerOf, OVERLAY } from './pieces';

export const MAX_SAVED_BUILDS = 10;
export const BUILD_NAME_MAX = 24;

export interface SavedPiece {
  kind: string;
  tileX: number;
  tileZ: number;
  rotation: number;
}

/** Trims and collapses whitespace; null if empty or too long. */
export function parseBuildName(raw: string): string | null {
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name.length > 0 && name.length <= BUILD_NAME_MAX ? name : null;
}

/**
 * The saved pieces that can go back on a board: known kinds, on the grid, a valid
 * rotation, one per tile and layer (the first wins), and no fireflies over a
 * building. A build saved before a piece kind was renamed or removed still loads,
 * minus those pieces.
 */
export function placeablePieces(pieces: readonly SavedPiece[]): SavedPiece[] {
  const valid = pieces.filter(
    (p) =>
      isPieceKind(p.kind) &&
      inBounds(p.tileX, p.tileZ) &&
      Number.isInteger(p.rotation) &&
      p.rotation >= 0 &&
      p.rotation <= 3,
  );
  const ground = new Map<number, string>();
  for (const p of valid) {
    const key = tileKey(p.tileX, p.tileZ);
    if (layerOf(p.kind) !== OVERLAY && !ground.has(key))
      ground.set(key, p.kind);
  }
  const used = new Set<string>();
  return valid.filter((p) => {
    const key = tileKey(p.tileX, p.tileZ);
    const layer = layerOf(p.kind);
    const cell = `${layer}:${key}`;
    if (used.has(cell)) return false;
    if (layer === OVERLAY && isBuilding(ground.get(key) ?? '')) return false;
    used.add(cell);
    return true;
  });
}
