// Movement rules shared by the module (validation) and the client (prediction).
// Pure TypeScript: must not import spacetimedb/server.
import { GRID_SIZE, TILE_SIZE } from './grid';

/** Client walking speed in world units per second. */
export const WALK_SPEED = 4.5;
/** Server allowance above walking speed, for frame-time and clock jitter. */
export const MAX_SPEED = WALK_SPEED * 1.3;
/** Seconds of movement that can be banked, so bursty network delivery is not clamped. */
export const MOVE_BURST = 0.6;
/** Half-width of the walkable area: the grass plus part of the beach. */
export const WORLD_LIMIT = (GRID_SIZE * TILE_SIZE) / 2 + 0.6;

export interface Vec2 {
  x: number;
  z: number;
}

export interface MoveResult {
  pos: Vec2;
  budget: number;
}

export function isFiniteVec(p: Vec2): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z);
}

export function clampToWorld(p: Vec2): Vec2 {
  const clamp = (v: number) => Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, v));
  return { x: clamp(p.x), z: clamp(p.z) };
}

/**
 * Token-bucket speed limit: the budget refills at MAX_SPEED per second (capped at
 * MOVE_BURST seconds' worth) and each move spends its distance. A move longer than
 * the budget is shortened along its direction.
 */
export function constrainMove(
  prev: Vec2,
  next: Vec2,
  budget: number,
  dtSeconds: number,
): MoveResult {
  const available = Math.min(
    budget + MAX_SPEED * Math.max(dtSeconds, 0),
    MAX_SPEED * MOVE_BURST,
  );
  const target = clampToWorld(next);
  const dx = target.x - prev.x;
  const dz = target.z - prev.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= available) return { pos: target, budget: available - dist };
  const scale = available / dist;
  return { pos: { x: prev.x + dx * scale, z: prev.z + dz * scale }, budget: 0 };
}

export function normalizeHeading(heading: number): number {
  const tau = Math.PI * 2;
  return ((heading % tau) + tau) % tau;
}
