// Saved build rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.
import { inBounds, tileKey } from './grid';
import { isPieceKind } from './pieces';

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
 * rotation, and one per tile (the first wins). A build saved before a piece kind was
 * renamed or removed still loads, minus those pieces.
 */
export function placeablePieces(pieces: readonly SavedPiece[]): SavedPiece[] {
  const used = new Set<number>();
  return pieces.filter((p) => {
    if (!isPieceKind(p.kind) || !inBounds(p.tileX, p.tileZ)) return false;
    if (!Number.isInteger(p.rotation) || p.rotation < 0 || p.rotation > 3)
      return false;
    const key = tileKey(p.tileX, p.tileZ);
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
}
