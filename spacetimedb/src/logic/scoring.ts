// Co-op scoring shared by the module (the authoritative score) and the client (the
// live score card). Every piece scores; good pairings score double. Pure TypeScript:
// must not import spacetimedb/server.
import { layerOf, OVERLAY, type PieceKind } from './pieces';

export interface BoardPiece {
  kind: string;
  tileX: number;
  tileZ: number;
}

/** A pairing that doubles a piece's points. */
export interface Combo {
  kind: PieceKind;
  partners: PieceKind[];
  /** Beside: on one of the four side tiles. Under: the piece it floats over. */
  where: 'beside' | 'under';
  label: string;
}

export const COMBOS: Combo[] = [
  {
    kind: 'bridge',
    partners: ['water'],
    where: 'beside',
    label: 'Bridge by water',
  },
  {
    kind: 'lamp',
    partners: ['path', 'tile'],
    where: 'beside',
    label: 'Lamp by a path',
  },
  {
    kind: 'bench',
    partners: ['path', 'tile'],
    where: 'beside',
    label: 'Bench by a path',
  },
  {
    kind: 'well',
    partners: ['house'],
    where: 'beside',
    label: 'Well by a house',
  },
  {
    kind: 'flowers',
    partners: ['house'],
    where: 'beside',
    label: 'Flowers by a house',
  },
  {
    kind: 'fence',
    partners: ['grass', 'flowers'],
    where: 'beside',
    label: 'Fence by greenery',
  },
  {
    kind: 'wall',
    partners: ['tower'],
    where: 'beside',
    label: 'Wall by a tower',
  },
  {
    kind: 'fireflies',
    partners: ['grass', 'flowers', 'tree', 'pine'],
    where: 'under',
    label: 'Fireflies over greenery',
  },
];

/** Points for one, two, and three stars. */
export const STAR_THRESHOLDS = [25, 50, 100] as const;

export interface BoardScore {
  score: number;
  /** Pieces that scored double, per combo, most first. */
  combos: { label: string; count: number }[];
  stars: number;
}

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** One point per piece, two for a piece with its combo partner. */
export function scoreBoard(pieces: readonly BoardPiece[]): BoardScore {
  const ground = new Map<string, string>();
  for (const p of pieces) {
    if (layerOf(p.kind) !== OVERLAY)
      ground.set(`${p.tileX},${p.tileZ}`, p.kind);
  }
  const counts = new Map<Combo, number>();
  let score = 0;
  for (const p of pieces) {
    const combo = matchedCombo(p, ground);
    if (combo) counts.set(combo, (counts.get(combo) ?? 0) + 1);
    score += combo ? 2 : 1;
  }
  const combos = [...counts]
    .map(([combo, count]) => ({ label: combo.label, count }))
    .sort((a, b) => b.count - a.count);
  return { score, combos, stars: starsFor(score) };
}

function matchedCombo(
  p: BoardPiece,
  ground: Map<string, string>,
): Combo | undefined {
  const combo = COMBOS.find((c) => c.kind === p.kind);
  if (!combo) return undefined;
  const spots = combo.where === 'under' ? [[0, 0] as const] : SIDES;
  const partners = combo.partners as string[];
  const found = spots.some(([dx, dz]) => {
    const kind = ground.get(`${p.tileX + dx},${p.tileZ + dz}`);
    return kind !== undefined && partners.includes(kind);
  });
  return found ? combo : undefined;
}

export function starsFor(score: number): number {
  return STAR_THRESHOLDS.filter((points) => score >= points).length;
}

/** Points still needed for the next star, or null with all three. */
export function pointsToNextStar(score: number): number | null {
  const next = STAR_THRESHOLDS.find((points) => score < points);
  return next === undefined ? null : next - score;
}
