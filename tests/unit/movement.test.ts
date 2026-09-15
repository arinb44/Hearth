import { describe, expect, it } from 'vitest';
import {
  clampToWorld,
  constrainMove,
  isFiniteVec,
  MAX_SPEED,
  MOVE_BURST,
  normalizeHeading,
  WORLD_LIMIT,
} from '../../spacetimedb/src/logic/movement';

const origin = { x: 0, z: 0 };

describe('clampToWorld', () => {
  it('keeps positions inside the island', () => {
    expect(clampToWorld({ x: 1, z: -2 })).toEqual({ x: 1, z: -2 });
    expect(clampToWorld({ x: 999, z: -999 })).toEqual({
      x: WORLD_LIMIT,
      z: -WORLD_LIMIT,
    });
  });
});

describe('constrainMove', () => {
  it('accepts a normal step within the speed limit', () => {
    const { pos, budget } = constrainMove(origin, { x: 0.4, z: 0 }, 0, 0.1);
    expect(pos.x).toBeCloseTo(0.4);
    expect(budget).toBeCloseTo(MAX_SPEED * 0.1 - 0.4);
  });

  it('shortens a teleport to the available budget, keeping its direction', () => {
    const { pos, budget } = constrainMove(origin, { x: 3, z: 4 }, 0, 0.1);
    const moved = Math.hypot(pos.x, pos.z);
    expect(moved).toBeCloseTo(MAX_SPEED * 0.1);
    expect(pos.x / pos.z).toBeCloseTo(3 / 4);
    expect(budget).toBe(0);
  });

  it('caps banked budget so idling cannot buy a long jump', () => {
    const { pos } = constrainMove(origin, { x: 100, z: 0 }, 0, 60);
    expect(pos.x).toBeCloseTo(MAX_SPEED * MOVE_BURST);
  });

  it('tolerates bursty delivery of honest updates', () => {
    // Three 0.45-unit steps sent 100 ms apart but delivered 10 ms apart.
    let pos = origin;
    let budget = MAX_SPEED * MOVE_BURST;
    for (let i = 1; i <= 3; i++) {
      ({ pos, budget } = constrainMove(
        pos,
        { x: 0.45 * i, z: 0 },
        budget,
        0.01,
      ));
    }
    expect(pos.x).toBeCloseTo(1.35);
  });

  it('ignores negative time deltas', () => {
    const { pos } = constrainMove(origin, { x: 5, z: 0 }, 0, -10);
    expect(pos).toEqual(origin);
  });

  it('clamps the destination to the island', () => {
    const start = { x: WORLD_LIMIT - 0.1, z: 0 };
    const { pos } = constrainMove(start, { x: WORLD_LIMIT + 5, z: 0 }, 10, 1);
    expect(pos.x).toBeCloseTo(WORLD_LIMIT);
  });
});

describe('validation helpers', () => {
  it('rejects non-finite positions', () => {
    expect(isFiniteVec({ x: 1, z: 2 })).toBe(true);
    expect(isFiniteVec({ x: Number.NaN, z: 0 })).toBe(false);
    expect(isFiniteVec({ x: 0, z: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('normalizes headings into [0, 2π)', () => {
    expect(normalizeHeading(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeHeading(5 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeHeading(0)).toBe(0);
  });
});
